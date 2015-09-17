var jlambda = require("../jlambda-core.js");
var jltst   = require("./jlambda-test.js");
var _ = require("lodash");

var PROG = {pluck: 'since'};


// DATA from : http://www.nactem.ac.uk/software/acromine/dictionary.py?sf=BMI

var DATA = [{"sf": "BMI", "lfs": [

	{"lf": "body mass index", "freq": 15893, "since": 1978, "vars": [{"lf": "body mass index", "freq": 14076, "since": 1978}, {"lf": "Body mass index", "freq": 1004, "since": 1981}, {"lf": "Body Mass Index", "freq": 497, "since": 1983}, {"lf": "body-mass index", "freq": 161, "since": 1987}, {"lf": "body mass indices", "freq": 58, "since": 1983}, {"lf": "body mass indexes", "freq": 31, "since": 1985}, {"lf": "body-mass-index", "freq": 20, "since": 1988}, {"lf": "Body-mass index", "freq": 11, "since": 1990}, {"lf": "Body-Mass-Index", "freq": 6, "since": 1995}, {"lf": "Body mass indices", "freq": 6, "since": 1996}, {"lf": "bodymass index", "freq": 3, "since": 2002}, {"lf": "Body-mass-index", "freq": 2, "since": 1999}, {"lf": "body mas index", "freq": 2, "since": 2004}, {"lf": "body mass Index", "freq": 2, "since": 2002}, {"lf": "Body mass indexes", "freq": 2, "since": 1996}, {"lf": "Body Mass index", "freq": 2, "since": 1997}, {"lf": "Body mas index", "freq": 1, "since": 2001}, {"lf": "Body- mass index", "freq": 1, "since": 2003}, {"lf": "body-mass Index", "freq": 1, "since": 2005}, {"lf": "Body mass Index", "freq": 1, "since": 2008}, {"lf": "Body Mass Indices", "freq": 1, "since": 1990}, {"lf": "body-mass indices", "freq": 1, "since": 2005}, {"lf": "BODY MASS INDEX", "freq": 1, "since": 2003}, {"lf": "body mass-index", "freq": 1, "since": 2006}, {"lf": "Body-Mass Index", "freq": 1, "since": 2007}, {"lf": "Body Mass Indexes", "freq": 1, "since": 1994}]}, 

	{"lf": "bicuculline methiodide", "freq": 113, "since": 1980, "vars": [{"lf": "bicuculline methiodide", "freq": 104, "since": 1981}, {"lf": "Bicuculline methiodide", "freq": 8, "since": 1980}, {"lf": "bicuculline-methiodide", "freq": 1, "since": 1996}]}, 

	{"lf": "brain-machine interface", "freq": 25, "since": 2002, "vars": [{"lf": "brain-machine interface", "freq": 17, "since": 2002}, {"lf": "Brain-machine interface", "freq": 2, "since": 2005}, {"lf": "brain-machine interfaces", "freq": 2, "since": 2007}, {"lf": "brain machine interfaces", "freq": 1, "since": 2006}, {"lf": "Brain-Machine Interface", "freq": 1, "since": 2004}, {"lf": "Brain Machine Interface", "freq": 1, "since": 2007}, {"lf": "brain machine interface", "freq": 1, "since": 2006}]}, 

	{"lf": "bone marrow involvement", "freq": 16, "since": 1989, "vars": [{"lf": "bone marrow involvement", "freq": 12, "since": 1995}, {"lf": "bone marrow infiltration", "freq": 3, "since": 1991}, {"lf": "Bone marrow involvement", "freq": 1, "since": 1989}]}, 

	{"lf": "brief motivational intervention", "freq": 9, "since": 2003, "vars": [{"lf": "brief motivational intervention", "freq": 3, "since": 2007}, {"lf": "Brief Motivational Interviewing", "freq": 1, "since": 2003}, {"lf": "Brief Motivational Intervention", "freq": 1, "since": 2007}, {"lf": "brief motivational interviewing", "freq": 1, "since": 2007}, {"lf": "brief Motivational Interviewing", "freq": 1, "since": 2007}, {"lf": "Brief Motivational Interview", "freq": 1, "since": 2007}, {"lf": "brief motivational interview", "freq": 1, "since": 2006}]}, 

	{"lf": "bone mass index", "freq": 7, "since": 2001, "vars": [{"lf": "bone mass index", "freq": 7, "since": 2001}]}, 

	{"lf": "bone marrow implantation", "freq": 7, "since": 2001, "vars": [{"lf": "Bone marrow implantation", "freq": 2, "since": 2001}, {"lf": "bone marrow implantation", "freq": 2, "since": 2004}, {"lf": "Bone marrow cell implantation", "freq": 1, "since": 2006}, {"lf": "Bone marrow cells implantation", "freq": 1, "since": 2006}, {"lf": "bone marrow cell implantation", "freq": 1, "since": 2001}]}, 

	{"lf": "biomedical informatics", "freq": 6, "since": 2003, "vars": [{"lf": "Biomedical Informatics", "freq": 3, "since": 2004}, {"lf": "biomedical informatics", "freq": 3, "since": 2003}]}, 

	{"lf": "Banna minipig inbred", "freq": 5, "since": 2004, "vars": [{"lf": "Banna minipig inbred", "freq": 4, "since": 2004}, {"lf": "Banna Minipig Inbred", "freq": 1, "since": 2004}]}]

	}];

var z = jlambda.context();

var P = jlambda.functionator(PROG,z);
var C = jlambda.context(DATA[0].lfs);
var R  = P(C);
var E  = [ 1978, 1980, 2002, 1989, 2003, 2001, 2001, 2003, 2004 ];
var E2 =  [ 15893, 113, 25, 16, 9, 7, 7, 6, 5 ];


var PROG = {pluck: 'since'};
jltst.testing(jlambda, PROG, DATA[0].lfs, jltst.singleDF(E));

PROG= [ {pluck: 'since'}, {pluck: 'freq'} ];
jltst.testing(jlambda, PROG, DATA[0].lfs, jltst.severalDF([E,E2]));


PROG =  {chain: 
	      [ {grep: {f:'regexp', match: 'bone', mod: 'i', from: 'lf'}, select: ['lf', 'since']} ,
			[ {pluck: 'lf' }, {pluck: 'since'} ] 
		  ] 
		};

jltst.testing(jlambda, PROG, DATA[0].lfs, jltst.severalDF([
	[ 'bone marrow involvement','bone mass index','bone marrow implantation' ],
    [ 1989, 2001, 2001 ] ]));



PROG = {chain:  [
	      {grep: {f: 'regexp', match: 'bone', mod: 'i', from:'lf'}, select:['vars'] },
	      {pluck : 'vars'},
	      { map: {pluck: 'freq'} }
	      ]
	    };
jltst.testing(jlambda, PROG, DATA[0].lfs, jltst.severalDF([ [ 12, 3, 1 ], [ 7 ], [ 2, 2, 1, 1, 1 ] ]));

PROG = { chain: [ {pluck: 'lfs'}, {map: {pluck: 'since'}}], with:0 };
jltst.testing(jlambda, PROG, DATA, jltst.severalDF([ E ] ));

PROG = { chain: [ {pluck: 'lfs', with: 0}, {map: {pluck: 'since'}}] };
jltst.testing(jlambda,PROG, DATA, jltst.severalDF([ E ] ));



PROG = { 
	chain: [
		[ {chain: [ {f: 'paste', sep: '+', with: ['freq', 'since']}, {f: 'paste', sep:' + '}, {reduce: {f: 'paste', sep: '  +  ' }}]},
		  {chain: [ {f: 'id', with: ['freq', 'since']}, {f:'+'}, {f: 'paste', sep:' + ' }, {reduce: {f:'paste', sep: ' + ' }}] },
		  {chain: [ { f:'id',  with: ['freq', 'since'] }, {f:'+'}, {f: '+' } ] }
	    ],
	     {reduce: {f: 'paste', sep: ' = '}}
	]
	};
expected = '15893+1978  +  113+1980  +  25+2002  +  16+1989  +  9+2003  +  7+2001  +  7+2001  +  6+2003  +  5+2004 = 17871 + 2093 + 2027 + 2005 + 2012 + 2008 + 2008 + 2009 + 2009 = 34042'; 
 
jltst.testing(jlambda, PROG, DATA[0].lfs, function(value) { return value != expected; });


