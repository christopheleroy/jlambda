var jlambda = require("./jlambda.js");


var dataIn = "";

process.stdin.on('readable', function() {
	var chunk = process.stdin.read()
	if(chunk != null) {
		dataIn += chunk;
	}

});

process.stdin.on('end', function() {
	var data = JSON.parse(dataIn);
	console.log(JSON.stringify(data.lambda));
	if(data.lambda && data.payload) {
		var ctx = jlambda.context();
		var lambda = jlambda.functionator(data.lambda, ctx);
		if(ctx.failed) {
			console.log(ctx.failures);
			process.exit(11);
		}else{
			var data = jlambda.context(data.payload);
			var dataout = lambda(data);
			if(dataout.failed) {
				console.log(dataout.failures);
				process.exit(7);
			}else{
				process.stdout.write(JSON.stringify(dataout.outp));
				process.exit(0);
			}
		}

	}
});

