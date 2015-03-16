var _ = require('lodash');

function testing(jlambda, prog, dataIn,  diffFinder) {

	var ctx = jlambda.context()
	var P   = jlambda.functionator(prog, ctx);

	if(P==null) {
		console.log("== COMPILATION FAILURE with: ");
		console.log(prog);
		return 7;
	}

	var DAT = jlambda.context(dataIn);
	Results = P(DAT);

	if(diffFinder=='show') {
		console.log(dataIn);
		console.log(prog);
		console.log(Results);
		return -1;
	}

	var rc = 1;
	
	// guess the structure of the results -- 
	var _ctx = jlambda.context(Results.outp);

	if(_ctx.mode == 'scalar' || _ctx.mode == 'object') {
		if(diffFinder(Results.outp)) {
			console.log(Results.outp);
		}else{
			rc=0;
		}
	}else{

		var differences = _.reduce(Results.outp, diffFinder, []);
		if(differences && differences.length>0) {
			console.log(differences);
		}else{
			rc=0;
		}
	}

	if(rc>0) {
		console.log("============= ERROR with ==================");
		console.log(prog);
	}else{
		console.log("- success with " + JSON.stringify(prog));
	}
	console.log(" ----------------------------------------------------------------------------------");
	return rc;
}

function singleArrayDiffFinder (E) {
	return function(list, item,i) { if(item!=E[i]) { list.push(i); }  return list; };
};

function nArrayDiffFinder (E) {
	return function (list, item, i) {
		debugger;
		if(i> E.length) {
			list.push([i, "too long"]);
		}else if(_.isArray(item) ) {
			var e = E[i];
			list = _.reduce(item, function(ll, x, j) {
				if(x != e[j]) {
					ll.push([i,j]);
				}
				return ll;
			}, list);
		}else{
			list.push(i);
		}
		return list;
	}
};

exports.testing = testing;
exports.singleDF = singleArrayDiffFinder;
exports.severalDF = nArrayDiffFinder;

