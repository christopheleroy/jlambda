var jlambda = require("../jlambda-core.js");
var jltst   = require("./jlambda-test.js");

var _ = require("lodash");

//C = jlambda.context( [2,3,4,5,6]);

PROG = {map: {lambda: 'a', value: {f:'+', with: [ {'$': 'a'}, {'#': 10} ]}}};

jltst.testing(jlambda, PROG, 
		[2,3,4,5,6],
		jltst.singleDF([12,13,14,15,16]) );


