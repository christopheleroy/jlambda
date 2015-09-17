var jlambda  =require("../jlambda-core.js");
var ajl = require("../jlambda-async.js");


var PROG = 
{async:
	{get: 
		{chain: [
			     {map:{lambda: 'q', 
			           value: {f: 'paste', 
			                     with: [ {'#': 'http://dev.markitondemand.com/Api/v2/Quote/json?symbol='}, {'$':'q'}] }}},
			     {f:'paste'} ]},
     json: true },
	then: {pluck: {'s': 'Symbol', 'p': 'LastPrice'}}, 
	parallel:true};

// http://live-nse.herokuapp.com/?symbol=AIAENG,ATULAUTO,BPCL,WIPRO

ctx = jlambda.context();
P   = jlambda.functionator(PROG,ctx);

aCtx = jlambda.context(["AAPL", "YHOO", "GOOG"], undefined, function() {
	console.log(this.outp);
});

P(aCtx);
// compute wind speed, wind gust from weather service for a (longitude: -71.2 - -70.5; lattitude: 42.2 - 42.5)
PROG = {
  chain: [
	{pluck: 'list'},
	{pluck: {id: 'id', name: 'name', longitude: ['coord', 'lon'], lattitude: ['coord', 'lat'], 
	                         temp_min: ['main', 'temp_min'],
	                         temp_max: ['main', 'temp_max'],
							 temp: ['main', 'temp'],
							 pressure: ['main', 'pressure'],
							 humidity: ['main', 'humidity'],
							 wind_deg: [ 'wind', 'deg'],
	                         wind_speed: ['wind', 'speed'], 
	                         wind_gust: ['wind', 'gust'],
	                         wind_deg: ['wind', 'deg'],
	                         weather: ['weather', 'description' ] } },
	{grep: {and: [{f:'>n', n: -91.2, from: 'longitude'}, {f:'<n', n: -50.5, from: 'longitude'}, 
	              {f:'>=n', n:32.2, from: 'lattitude'}, {f:'=<n', n: 52.5, from: 'lattitude'} ]}, 
		 select: ['lattitude', 'longitude', 'name', 'temp', 'pressure', 'humidity', 'wind_speed', 'wind_deg']},

	[{pluck: {lat: 'lattitude', long: 'longitude'}}, {pluck:'name'}, {pluck: 'temp'}, {pluck: 'pressure'}, {pluck: 'humidity'}, {pluck: 'wind_speed'}, {pluck: 'wind_deg'}],
	[ {f: 'id', with: 0}, {zip:[]} ]
	
]};



PROG = {async: 
			{get: "http://api.openweathermap.org/data/2.5/box/city?bbox=-100.6,31.8,-50.5,32.5,25&cluster=yes", json: true},
			then: PROG,
			xthen: {async: {get: {lambda:'q', value: {f: 'paste', with: [ {'#': 'http://'}, {'$':'q'} ]}}, json:true}, parallel:true,
					then: {f: 'id'} } };

ctx = jlambda.context();
P   = jlambda.functionator(PROG,ctx);
aCtx = jlambda.context(undefined, undefined, function() { 
	console.log(this.outp);
});
//P(aCtx);

