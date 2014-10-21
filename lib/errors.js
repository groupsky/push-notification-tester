var fs = require('fs');
var util = require('util');
var path = require('path');
var Hjson = require('hjson');
var _s = require('underscore.string');
var Handlebars = require('handlebars');
var errorsPath = path.join(__dirname, '..', 'errors');

Handlebars.registerHelper('toHexString', function(buffer){
  return buffer.toString('hex');
});
Handlebars.registerHelper('json', function(obj) {
  return Hjson.stringify(obj);
});

fs.readdir(errorsPath, function(err, files) {
  if (err) throw err;

  files.forEach(function(system){

    console.log('loading '+system);
    module.exports[system] = {};
    var systempath = path.join(errorsPath, system);

    fs.stat(systempath, function(err, stats){
      if (err) throw err;

      if (!stats.isDirectory()) {
        // don't know what to do with files here
        return;
      };

      fs.readdir(systempath, function(err, files) {
        if (err) throw err;

        files.forEach(function(typefile){
          var extension = path.extname(typefile);
          var typename = typefile.substr(0, typefile.length-extension.length);
          var typefile = path.join(systempath, typefile);

          switch (extension.toLowerCase()) {
            case ".hjson":
            case ".json":
              fs.readFile(typefile, function (err, data) {
                if (err) throw err;
                module.exports[system][typename] = Hjson.parse(data.toString('utf8'));
              });
              break;
          }
        });
      });
    });
  });
});

module.exports.render = function(template, args) {
  if (typeof template === "string")
    return Handlebars.compile(template)(args);

  var message = "<dl>";
  for (var key in template) {
    message += "<dt>"+key+"</dt>";
    message += "<dd>"+module.exports.render(template[key], args)+"</dd>";
  }
  return message + "</dl>";
}
module.exports.describe = function(system, type, code, args) {
  // console.log('describing ', system, type, code, args);
  if (!module.exports[system] || !module.exports[system][type]) {
    return "Error in "+system+" type "+type+" code "+code+"<br/><strong>Args</strong>: "+util.inspect(args);
  }

  // console.log('using system ', module.exports[system]);
  // console.log('using type ', module.exports[system][type]);
  // console.log('using template ', module.exports[system][type][code]);

  var template = module.exports[system][type];

  var message = '';
  if ('header' in template) {
    message += module.exports.render(template.header, args);
  }
  if (code in template.codes) {
    message += module.exports.render(template.codes[code], args);
  }
  if ('footer' in template) {
    message += module.exports.render(template.footer, args);
  }
  return message;
}
