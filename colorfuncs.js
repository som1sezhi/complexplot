const colorFuncs = new Map();

function registerColorFunc(label, src) {
	colorFuncs.set(label, src);
}

registerColorFunc("HSL, arctan",
`vec3 colorFunc(vec2 fz) {
	float h = mod(arg(fz) / (2. * PI), 1.);
	float l = 1. - 2. / PI * atan(length(fz)); // black at infinity
	// float l = 2. / PI * atan(length(fz)); // white at infinity
	return hsl2rgb(h, 1., l);
}`);

registerColorFunc("HSL, 1/(r^a+1)",
`vec3 colorFunc(vec2 fz) {
	const float a = .5; // modify this value for different curves

	float h = mod(arg(fz) / (2. * PI), 1.);
	float l = 1. / (pow(length(fz), a) + 1.); // black at infinity
	// float l = 1. - 1. / (pow(length(fz), a) + 1.); // white at infinity
	return hsl2rgb(h, 1., l);
}`);

registerColorFunc("from User:Jan_Homann/Mathematics",
`vec3 colorFunc(vec2 fz) {
	float h = mod(arg(fz) / (2. * PI), 1.);
	float s = 1. / (1. + .3 * log(length(fz) + 1.));
	float v = 1. - 1. / (1.1 + 5. * log(length(fz) + 1.));
	return hsv2rgb(h, s, v);
}`);

registerColorFunc("from Benutzer:Georg-Johann/Mathematik",
`float t(float x) {return 2. / PI * atan(PI / 2. * x);}
float u(float x) {return .5 * (x - 1. / x);}
float g(float x, float a, float b) {
	return .5 + .5 * t(2. * b * a * u(x / a));
}
vec3 colorFunc(vec2 fz) {
	//bool isInf = length(fz) > 1000000.;
	float h = mod(arg(fz) / (2. * PI), 1.);
	float s = g(length(fz), .4, .3);
	//float v = isInf ? 0. : 1. - g(length(fz), .6, .5);
	float v = 1. - g(length(fz), .6, .5);
	return hsv2rgb(h, s, v);
}`);

registerColorFunc("circles, linear growth",
`vec3 colorFunc(vec2 fz) {
	const float lower = .5; // value for lower part of each range
	const float upper = 1.; // value for upper part of each range
	const float spacing = 1.; // spacing between each circle

	float h = mod(arg(fz) / (2. * PI), 1.);
	float v = mix(lower, upper, fract(length(fz / spacing)));
	return hsv2rgb(h, 1., v);
}`);

registerColorFunc("circles, exponential growth",
`vec3 colorFunc(vec2 fz) {
	const float lower = .5; // value for lower part of each range
	const float upper = 1.; // value for upper part of each range
	const float b = 2.; // base used for size ratios

	float h = mod(arg(fz) / (2. * PI), 1.);
	float v = mix(lower, upper, mod(log(length(fz)) / log(b), 1.));
	return hsv2rgb(h, 1., v);
}`);

registerColorFunc("checkers",
`vec3 colorFunc(vec2 fz) {
	const float n = 8.; // no. of checkers per unit
	const float b = .5; // [0, 1], lower for darker checkers

	float h = mod(arg(fz) / (2. * PI), 1.);
	float l = 1. - 2. / PI * atan(length(fz));
	bool isEven = mod(floor(fz.x * n) + floor(fz.y * n), 2.) == 0.;
	return isEven ? hsl2rgb(h, 1., l) : b * hsl2rgb(h, 1., l);
}`);
