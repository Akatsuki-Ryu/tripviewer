var request = require('request'),
    csv = require('express-csv'),
    _ = require('underscore'),
    async = require('async'),
    moment = require('moment-timezone'),
    apiUrl = 'https://api.automatic.com';


exports.trips = function(req, res) {
  request.get({
    uri: apiUrl + '/trip/',
    qs: { page: req.query.page },
    headers: {Authorization: 'bearer ' + req.session.access_token},
    json: true
  }, function(e, r, body) {
    try {
      res.json(body.results);
    } catch(e) {
      console.log('error: ' + e);
      res.json(400, {'message': 'Invalid access_token'});
    }
  });
};


exports.trip = function(req, res) {
  request.get({
    uri: apiUrl + '/trip/' + req.params.id,
    headers: {Authorization: 'bearer ' + req.session.access_token},
    json: true
  }, function(e, r, body) {
    try {
      res.json(body);
    } catch(e) {
      console.log('error: ' + e);
      res.json(400, {'message': 'Invalid access_token'});
    }
  });
};


exports.vehicles = function(req, res) {
  downloadVehicles(req, function(e, vehicles) {
    if(vehicles) {
      res.json(vehicles);
    } else {
      console.log('error: ' + e);
      res.json(400, {'message': 'Invalid access_token'});
    }
  });
};


exports.downloadTripsJSON = function(req, res) {
  async.parallel([
    function(cb) { downloadAllTrips(req, cb); },
    function(cb) { downloadVehicles(req, cb); }
  ], function(e, data) {
    res.json(mergeTripsAndVehicles(data[0], data[1]));
  });
};


exports.downloadTripsCSV = function(req, res) {
  async.parallel([
    function(cb) { downloadAllTrips(req, cb); },
    function(cb) { downloadVehicles(req, cb); }
  ], function(e, data) {
    var trips = mergeTripsAndVehicles(data[0], data[1]);
    var tripsAsArray = trips.map(tripToArray);
    tripsAsArray.unshift(fieldNames());
    res.setHeader('Content-disposition', 'attachment; filename=trips.csv');
    res.csv(tripsAsArray);
  });
};


function downloadAllTrips(req, cb) {
  var uri = apiUrl + '/trip/',
      trips = [];
  async.until(function(){ return !uri; }, function(cb) {
    request.get({
      uri: uri,
      headers: {Authorization: 'bearer ' + req.session.access_token},
      json: true,
      qs: { limit: 25 }
    }, function(e, r, body) {

      if(e || body.error) {
        cb(new Error(e || body.error));
        return;
      }

      trips = trips.concat(body.results);
      uri = body['_metadata'] ? body['_metadata'].next : undefined;

      cb();
    });
  }, function(e) {
    if(req.query.trip_ids) {
      var trip_ids = req.query.trip_ids.split(',');
      trips = filterTrips(trips, trip_ids);
    }

    trips = _.sortBy(trips, function(trip) {
      return -moment(trip.started_at).valueOf();
    });
    cb(e, trips);
  });
}


function downloadVehicles (req, cb) {
  request.get({
    uri: apiUrl + '/vehicle/',
    headers: {Authorization: 'bearer ' + req.session.access_token},
    json: true
  }, function(e, r, body) {
    cb(e, body.results);
  });
}


function filterTrips(trips, trip_ids) {
  return _.filter(trips, function(trip) {
    return trip_ids.indexOf(trip.id) != -1;
  });
};


function fieldNames() {
  return [
    'Vehicle',
    'Start Location Name',
    'Start Location Lat',
    'Start Location Lon',
    'Start Location Accuracy (meters)',
    'Start Time',
    'End Location Name',
    'End Location Lat',
    'End Location Lon',
    'End Location Accuracy (meters)',
    'End Time',
    'Path',
    'Distance (mi)',
    'Duration (seconds)',
    'Hard Accelerations',
    'Hard Brakes',
    'Duration Over 80 mph (secs)',
    'Duration Over 75 mph (secs)',
    'Duration Over 70 mph (secs)',
    'Fuel Cost (USD)',
    'Fuel Volume (l)',
    'Average MPG'
  ];
};


function tripToArray(t) {
  return [
    formatVehicle(t.vehicle),
    t.start_address.name,
    t.start_location.lat,
    t.start_location.lon,
    t.start_location.accuracy_m,
    t.started_at,
    t.end_address.name,
    t.end_location.lat,
    t.end_location.lon,
    t.end_location.accuracy_m,
    t.ended_at,
    t.path,
    formatDistance(t.distance_m),
    t.duration_s,
    t.hard_accels,
    t.hard_brakes,
    t.duration_over_80_s,
    t.duration_over_75_s,
    t.duration_over_70_s,
    formatFuelCost(t.fuel_cost_usd),
    t.fuel_volume_l,
    t.average_mpg
  ];
};


function formatVehicle(v) {
  return [(v.year || ''), (v.make || ''), (v.model || '')].join(' ');
};


function formatDistance(distance) {
  //convert from m to mi
  return (distance / 1609.34).toFixed(2);
};


function formatFuelCost(fuelCost) {
  return '$' + fuelCost.toFixed(2);
};


function mergeTripsAndVehicles(trips, vehicles) {
  var vehicleObj = _.object(_.pluck(vehicles, 'url'), vehicles);

  return trips.map(function(trip) {
    trip.vehicle = vehicleObj[trip.vehicle];
    return trip;
  });
}
