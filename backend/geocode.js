'use strict';

var https = require('https');

function geocodificar(endereco, cidade, uf) {
  return new Promise(function(resolve) {
    var partes = [];
    if (endereco) partes.push(endereco);
    if (cidade) partes.push(cidade);
    if (uf) partes.push(uf + ', Brasil');
    if (partes.length === 0) { resolve(null); return; }
    var query = encodeURIComponent(partes.join(', '));
    var timer = setTimeout(function() { resolve(null); }, 8000);
    var url = 'https://nominatim.openstreetmap.org/search?q=' + query + '&format=json&limit=1&countrycodes=br';
    https.get(url, { headers: { 'User-Agent': 'CorteCerto/1.0 (contato@cortecerto.com)' } }, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        clearTimeout(timer);
        try {
          var json = JSON.parse(data);
          if (json.length > 0) {
            resolve({ lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) });
          } else {
            resolve(null);
          }
        } catch (e) { resolve(null); }
      });
    }).on('error', function() { clearTimeout(timer); resolve(null); });
  });
}

module.exports = { geocodificar: geocodificar };
