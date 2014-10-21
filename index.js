var app = require('express')();
var path = require('path');
var http = require('http').Server(app);
var io = require('socket.io')(http);
var util = require('util');
var multer  = require('multer')
var apn = require('apn');
var exphbs  = require('express-handlebars');
var crypto = require('crypto');
var errors = require('./lib/errors');

app.use(multer({
  // inMemory: true
}));

var hbs = exphbs.create();
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

app.get('/', function(req, res){
  res.sendFile(path.resolve('index.html'));
});

app.get('/socket.io/socket.io.js', function(req, res){
  res.sendFile(path.resolve('node_modules/socket.io/lib/client.js'));
});

app.post('/send', function(req, res){
  crypto.randomBytes(48, function(ex, buf) {
    var token = buf.toString('hex');
    res.render('results', {
      token: token,
      layout: false
    });
    var logs = [];

    var nsp = io.of('/'+token);
    var log = function() {
      console.log.apply(console, arguments);
      var args = Array.prototype.slice.call(arguments);
      var msg = "";
      args.forEach(function(arg){
        if (typeof arg === "object") {
          arg = util.inspect(arg);
        }
        if (msg.length > 0) msg += " ";
        msg += arg;
      });
      args = ["log", msg];
      if (Object.keys(nsp.connected).length == 0) {
        logs.push(args);
      }
      nsp.emit.apply(nsp, args);
    }

    var opts = {
      production: false,
      interval: 1,
      cert: req.files.certificate.path,
      key: req.files.privatekey.path
    };
    try {
      var service = new apn.Connection(opts);
    } catch (err) {
      log("Exception while creating connection: ", err);
      return;
    }
    try {
      var feedback = new apn.Feedback(opts);
    } catch (err) {
      log("Exception while creating feedback: ", err);
      return;
    }


    nsp.on('connection', function(socket){
      console.log('======= connected');
      logs.forEach(function(msg){
        socket.emit.apply(socket, msg);
      });
      logs = null;
      socket.on('disconnect', function() {
        console.log('shutting down');
        service.shutdown();
        feedback.cancel();
        service = null;
        feedback = null;
      });
    });

    log('Sending notification...');

    service.on('connected', function() {
      log("Connected");
    });
    service.on('transmitted', function(notification, device) {
      log("Notification transmitted to: "+device.token.toString('hex')+"\n\n");
    });
    service.on('transmissionError', function(errCode, notification, device) {
      log(errors.describe('apns', 'transmissionError', errCode, {errCode: errCode, notification: notification, device: device}));
      // log("Notification caused error: " + errCode + " for device " + (device?device.token.toString('hex'):device));
      // log("Notification =", notification);
      // log("<strong>Error description</strong>:", errors['transmissionError'][errCode]);
    });
    service.on('timeout', function () {
      log('Timed out');
    });
    service.on('disconnected', function() {
      log('Disconnected');
    });
    service.on('socketError', function(err) {
      log('SocketError ', err);
    });
    service.on('error', function(err) {
      log('Error: ', err);
    });
    feedback.on('error', function(err) {
      log('Feedback error: ', err);
      feedback.cancel();
    });
    feedback.on('feedbackError', function(err) {
      log('Feedback connection error: ', err);
    });
    feedback.on('feedback', function(feedback) {
      if (feedback && typeof feedback === 'object' && Object.keys(feedback).length > 0)
        log('feedback: ', feedback);
    });

    var note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + 600; // Expires 10 minutes from now.
    if (req.body.badge)
      note.badge = req.body.badge;
    if (req.body.alert)
      note.alert = req.body.alert;
    if (req.body.payload)
      note.payload = req.body.payload;

    service.pushNotification(note, req.body.device);
  });
});

io.on('connection', function(socket){
  console.log('a user connected');
  socket.on('disconnect', function(){
    console.log('user disconnected');
  });
  socket.on('chat message', function(msg){
    console.log('message: ' + msg);
    io.emit('chat message', msg);
    socket.emit('chat message', 'sent...');
  });
});


http.listen(3000, function(){
  console.log('listening on *:3000');
});
