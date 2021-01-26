const funcs = new Map();

function register(name, src) {
	funcs.set(name, src);
}

register("r_sinh", `
float r_sinh(float x) {
	return (exp(x) - exp(-x)) * .5;
}`);

register("r_cosh", `
float r_cosh(float x) {
	return (exp(x) + exp(-x)) * .5;
}`);

register("arg", `
float arg(vec2 z) {
	return atan(z.y, z.x);
}`);

register("c_abs", `
vec2 c_abs(vec2 z) {
	return vec2(length(z), 0.);
}`);

register("c_arg", `
vec2 c_arg(vec2 z) {
	return vec2(arg(z), 0.);
}`);

register("c_sgn", `
vec2 c_sgn(vec2 z) {
	if (z == vec2(0., 0.)) return vec2(0., 0.);
	return normalize(z);
}`);

register("c_re", `
vec2 c_re(vec2 z) {
	return vec2(z.x, 0.);
}`);

register("c_im", `
vec2 c_im(vec2 z) {
	return vec2(z.y, 0.);
}`);

register("c_add", `
vec2 c_add(vec2 z, vec2 w) {
	return z + w;
}`);

register("c_sub", `
vec2 c_sub(vec2 z, vec2 w) {
	return z - w;
}`);

register("c_mul", `
vec2 c_mul(vec2 z, vec2 w) {
	return vec2(z.x * w.x - z.y * w.y, z.x * w.y + z.y * w.x);
}`);

register("c_div", `
vec2 c_div(vec2 z, vec2 w) {
	return vec2(
		(z.x * w.x + z.y * w.y) / (w.x * w.x + w.y * w.y),
		(z.y * w.x - z.x * w.y) / (w.x * w.x + w.y * w.y)
	);
}`);

register("c_neg", `
vec2 c_neg(vec2 z) {
	return -z;
}`);

register("c_exp", `
vec2 c_exp(vec2 z) {
	return vec2(exp(z.x) * cos(z.y), exp(z.x) * sin(z.y));
}`);

register("c_ln", `
vec2 c_ln(vec2 z) {
	return vec2(log(length(z)), arg(z));
}`);

register("c_pow", `
vec2 c_pow(vec2 z, vec2 w) {
	if (z == C_ZERO) {
		return w == C_ZERO ? C_ONE : C_ZERO;
	}
	return c_exp(c_mul(w, c_ln(z)));
}`);

register("c_sqrt", `
vec2 c_sqrt(vec2 z) {
	return c_pow(z, vec2(.5, 0.));
}`);

// ----- trig -----

register("c_sin", `
vec2 c_sin(vec2 z) {
	return vec2(sin(z.x) * r_cosh(z.y), cos(z.x) * r_sinh(z.y));
}`);

register("c_cos", `
vec2 c_cos(vec2 z) {
	return vec2(cos(z.x) * r_cosh(z.y), -sin(z.x) * r_sinh(z.y));
}`);

register("c_tan", `
vec2 c_tan(vec2 z) {
	return c_div(c_sin(z), c_cos(z));
}`);

// TODO: write a better algorithm than this one
register("c_asin", `
vec2 c_asin(vec2 z) {
	return c_mul(C_I,
		c_ln(
			c_sqrt(C_ONE - c_mul(z, z)) -
			c_mul(C_I, z)
		)
	);
}`);

register("c_acos", `
vec2 c_acos(vec2 z) {
	return vec2(PI / 2., 0.) - c_asin(z);
}`);

register("c_atan", `
vec2 c_atan(vec2 z) {
	return c_mul(
		-c_div(C_I, C_TWO),
		c_ln(
			c_div(
				C_I - z,
				C_I + z
			)
		)
	);
}`);

// ----- misc -----

register("c_avg", `
vec2 c_avg(vec2 z, vec2 w) {
	return vec2((z.x + w.x) * .5, (z.y + w.y) * .5);
}`);


// ====== SPECIAL FUNCTIONS ======
const specialFuncs = new Map(); // func names to glsl code generators
const specialFuncInstances = new Map(); // ids to glsl code

function addSpecialFuncInstance(name, args) {
	let id = 0;
	while (specialFuncInstances.get(id)) {
		id++;
	}
	specialFuncInstances.set(id, specialFuncs.get(name)(args, id));
	return id;
}

function clearSpecialFuncInstances() {
	specialFuncInstances.clear();
}

function registerSpecial(name, generatorFunc) {
	specialFuncs.set(name, generatorFunc);
}

registerSpecial("iter", function(args, id) {
	return `
	vec2 iter_${id}(vec2 z) {
		vec2 z0 = ${args[1]};
		int limit = int(${args[3]}.x);
		for (int i = 0; i < MAX_ITERATIONS; i++) {
			if (i >= limit) {break;}
			z0 = ${args[2]};
		}
		return z0;
	}`;
});
