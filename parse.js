class Node {
	constructor(token) {
		this.token = token;
		this.children = [];
	}

	addChild(node) {
		// use unshift instead of push to maintain the order of the operands
		// as they get popped out of the stack
		this.children.unshift(node);
	}
}

class Token {
	constructor(val, type, preced, assoc, arity, specialInclude) {
		this.val = val;
		this.type = type;
		this.preced = preced;
		this.assoc = assoc;
		if (type == "op") {
			this.arity = 2;
		} else if (type == "un-op") {
			this.arity = 1;
		} else {
			this.arity = arity;
		}
		this.specialInclude = specialInclude;
	}

	toString() {
		return this.val;
	}
}

// this is just to make it easier for me to add functions
const unaryFuncList = [
	'abs', 'arg', 'sgn', 'conj', 're', 'im',
	'exp', 'ln', 'sqrt',
	'sin', 'cos', 'tan',
	'asin', 'acos', 'atan',
	'gamma', 'factorial'
];

const alphaTokens = {
	"z": new Token("z", "var"),
	"z'": new Token("z'", "var"),
	"k": new Token("k", "var"),
	"s": new Token("s", "var"),
	"t": new Token("t", "var"),
	"i": new Token("i", "num"),
	"pi": new Token("pi", "num"),
	"e": new Token("e", "num"),
	"iter": new Token("iter", "special-func", 20, "left", 4, [true, true, false, true]),
	"iteresc": new Token("iteresc", "special-func", 20, "left", 5, [true, true, false, true, true]),
	"sum": new Token("sum", "special-func", 20, "left", 3, [true, false, true])
};

const funcNames = {
	"+ op": "c_add",
	"- op": "c_sub",
	"- un-op": "c_neg",
	"* op": "c_mul",
	"/ op": "c_div",
	"^ op": "c_pow",
	"iter special-func": "iter",
	"iteresc special-func": "iteresc",
	"sum special-func": "sum"
}

function addFunction(tokenName, arity, glslFuncName) {
	if (arity === undefined) {
		arity = 1;
	}
	alphaTokens[tokenName] = new Token(tokenName, "func", 20, "left", arity);
	if (glslFuncName === undefined) {
		glslFuncName = "c_" + tokenName;
	}
	funcNames[tokenName + " func"] = glslFuncName;
}

for (const fn of unaryFuncList) {
	addFunction(fn);
}
// aliases
addFunction("mag", 1, "c_abs");
addFunction("angle", 1, "c_arg");
addFunction("log", 1, "c_ln");
addFunction("arcsin", 1, "c_asin");
addFunction("arccos", 1, "c_acos");
addFunction("arctan", 1, "c_atan");
// other funcs
addFunction("avg", 2);

const validTokens = {
	"+": new Token("+", "op", 14, "left"),
	"-": {
		"binary": new Token("-", "op", 14, "left"),
		"unary": new Token("-", "un-op", 17, "right")
	},
	"*": new Token("*", "op", 15, "left"),
	"/": new Token("/", "op", 15, "left"),
	"^": new Token("^", "op", 18, "right"),
	"(": new Token("(", "left-paren"),
	")": new Token(")", "right-paren"),
	",": new Token(",", "comma")
};
Object.assign(validTokens, alphaTokens);

const alphaSymbols = Object.getOwnPropertyNames(alphaTokens);

// split a string of letters into valid tokens, if possible
function splitWord(word) {
	// based on some code from http://davidbau.com/conformal/
	const splits = [];
	let start = 0;
	while (start < word.length) {
		let found = false;
		for (let end = word.length; end > start; end--) {
			let substr = word.substring(start, end);
			if (alphaSymbols.includes(substr)) {
				splits.push(substr)
				start = end;
				found = true;
				break;
			}
		}
		if (!found) {
			splits.push(word.substr(start));
			break;
		}
	}
	return splits;
}

// split a formula in string form into token strings
function splitString(str) {
	// based on some code from http://davidbau.com/conformal/
	let regex = /(?:\s*)(?:((?:\d+(?:\.\d*)?|\.\d+)|[-+*/()^,]|[a-zA-Z']+)|(\S))/g;
	const splitStr = [];
	let match;
	while ((match = regex.exec(str)) != null) {
		if (match[2]) {
			throw new Error("invalid token: " + match[2]);
		}
		if (/^[a-zA-Z]/.test(match[1])) {
			splitStr.push.apply(splitStr, splitWord(match[1]));
		} else {
			splitStr.push(match[1]);
		}
	}
	return splitStr;
}

// convert an array of token strings into actual Tokens
function assignTokens(splitStr) {
	const tokens = [];
	for (const s of splitStr) {
		if (/\d+(?:\.\d*)?|\.\d+/.test(s)) {
			tokens.push(new Token(s, "num"));
		} else if (s == "-") { // special case for minus/neg
			if (tokens.length) { // if not at beginning of array
				const prevToken = tokens[tokens.length - 1];
				const precedesUnary = ["op", "un-op", "left-paren", "comma"];
				if (precedesUnary.includes(prevToken.type)) {
					tokens.push(validTokens["-"]["unary"]);
				} else {
					tokens.push(validTokens["-"]["binary"]);
				}
			} else { // if at beginning of formula, - is unary
				tokens.push(validTokens["-"]["unary"]);
			}
		} else if (validTokens[s]) {
			tokens.push(validTokens[s]);
		} else {
			throw new Error("invalid token: " + s);
		}
	}
	if (!tokens.length) {
		throw new Error("empty formula");
	}
	// run through tokens again to insert implicit multiplication tokens
	const operandTypes = []
	for (let i = 1; i < tokens.length; i++) {
		if (["var", "num", "right-paren"].includes(tokens[i - 1].type) &&
		    ["var", "num", "left-paren", "func", "special-func"].includes(tokens[i].type)) {
			tokens.splice(i, 0, validTokens["*"]);
			i++;
		}
	}
	return tokens;
}

// split a string formula into Tokens
function lex(str) {
	return assignTokens(splitString(str));
}

// parse array of tokens into a syntax tree
function shuntingYard(tokens) {
	const output = []; // stack of subtrees
	const ops = []; // stack of operator tokens
	ops.peek = () => ops[ops.length - 1];

	// pop operator off the stack, form a tree out of the operands in output
	// with the operator at the root, and push the tree onto output
	function pushOp() {
		const op = ops.pop();
		const opNode = new Node(op);
		for (let i = 0; i < op.arity; i++) {
			opNode.addChild(output.pop());
		}
		output.push(opNode);
	}

	while (tokens.length) {
		const token = tokens.shift();
		if (token.type == "num" || token.type == "var") {
			output.push(new Node(token));
		} else if (token.type == "func" || token.type == "special-func") {
			ops.push(token);
		} else if (token.type == "op") {
			while (ops.length &&
			       ops.peek().type != "left-paren" &&
			       (ops.peek().preced > token.preced ||
			       (ops.peek().preced == token.preced && token.assoc == "left"))) {
				pushOp();
			}
			ops.push(token);
		} else if (token.type == "un-op") {
			ops.push(token);
		} else if (token.type == "left-paren") {
			ops.push(token);
		} else if (token.type == "right-paren") {
			while (ops.peek().type != "left-paren") {
				pushOp();
			}
			if (ops.peek().type == "left-paren") {
				ops.pop();
			}
			if (ops.length &&
				(ops.peek().type == "func" || token.type == "special-func")) {
				pushOp();
			}
		} else if (token.type == "comma") {
			while (ops.peek().type != "left-paren") {
				pushOp();
			}
		}
	}
	while (ops.length) {
		pushOp();
	}
	return output[0];
}

function createExp(node) {
	if (node.token.type == "num") {
		// special constants
		if (node.token == validTokens["i"]) {
			return "vec2(0.,1.)";
		} else if (node.token == validTokens["pi"]) {
			return "vec2(PI,0.)";
		} else if (node.token == validTokens["e"]) {
			return "vec2(E,0.)";
		}
		if (node.token.val.includes(".")) {
			return `vec2(${node.token.val},0.)`
		}
		// add decimal point for numbers missing it
		return `vec2(${node.token.val}.,0.)`
	} else if (node.token.type == "var") {
		// special case
		if (node.token.val == "z'") return "z0";
		else if (node.token.val == "s") return "vec2(u_s,0.)";
		else if (node.token.val == "t") return "vec2(u_t,0.)";
		return node.token.val;
	} else if (node.token.type == "special-func") {
		// glsl expressions for each of the arguments given by the user
		const funcArgs = [];
		// actual glsl args to be injected into f(z) code
		let argsExp = "";
		for (let i = 0; i < node.children.length; i++) {
			let subExp = createExp(node.children[i])
			funcArgs.push(subExp);
			if (node.token.specialInclude[i]) {
				if (argsExp) argsExp += ", ";
				argsExp += subExp;
			}
		}
		const funcName = funcNames[node.token.val + " " + node.token.type];
		const id = addSpecialFuncInstance(funcName, funcArgs);
		return `${funcName}_${id}(${argsExp})`;
	}
	// for operators and normal functions
	let exp = funcNames[node.token.val + " " + node.token.type] + "(";
	for (let i = 0; i < node.children.length; i++) {
		if (i > 0) {
			exp += ", ";
		}
		exp += createExp(node.children[i]);
	}
	exp += ")";
	return exp;
}

function parseFormula(str) {
	clearSpecialFuncInstances();
	return createExp(shuntingYard(lex(str)));
}
