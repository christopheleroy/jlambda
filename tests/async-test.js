var jlambda  =require("../jlambda-core.js");
var ajl = require("../jlambda-async.js");


PROG = 
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



ctx = jlambda.context();
P   = jlambda.functionator(PROG,ctx);

aCtx = jlambda.context(["AAPL", "YHOO", "GOOG"]);
P(aCtx);
aCtx.done = function() {
	console.log(aCtx.outp);
};

