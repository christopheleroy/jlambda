var jlambda = require("../jlambda-core.js");
var _ = require("lodash");



PROG = { reduce: {f: 'paste', sep:' @ '}};
P = jlambda.functionator(PROG);
C = jlambda.context([ 17871, 2093, 2027, 2005, 2012, 2008, 2008, 2009, 2009 ]);
R = P(C);
 console.log(R);