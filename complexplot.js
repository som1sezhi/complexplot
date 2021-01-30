const SCROLL_SENSITIVITY = 1.2;
const DEFAULT_ZOOM = 0.01;

const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl");

let colorFuncSource = colorFuncs.get("HSL, arctan");

let programInfo, buffers;
let zoom = DEFAULT_ZOOM;
let center = [0, 0];
let paramS = 0, paramT = 0;

const formulaBox = document.getElementById("formula-box");
const goButton = document.getElementById("go-button");
const resetZoomButton = document.getElementById("reset-zoom-button");
const coordsBox = document.getElementById("coords-box");
const colorSelect = document.getElementById("color-select");
for (const func of colorFuncs) {
	const opt = document.createElement("option");
	opt.text = func[0];
	colorSelect.add(opt);
}
const colorCodeBox = document.getElementById("color-code-box");
const colorSetButton = document.getElementById("color-set-button");
colorCodeBox.value = colorFuncSource;

let allFuncs = "";
for (const func of funcs) {
	allFuncs += func[1];
}

goButton.onclick = function() {
	try {
		compile(formulaBox.value);
	} catch (e) {
		alert("An error occurred. Check console for details.");
		throw e;
	}
	draw();
}
formulaBox.addEventListener("keydown", function(e) {
	if (e.keyCode == 13) {
		e.preventDefault();
		goButton.click();
	}
});
formulaBox.addEventListener("change", function() {
	formulaBox.value = formulaBox.value.replace(/[\n\r]/g, " ");
})

resetZoomButton.onclick = function() {
	zoom = DEFAULT_ZOOM;
	center = [0, 0];
	draw();
}

window.addEventListener("resize", function() {
	resize();
	draw();
});

colorSelect.onchange = function() {
	colorCodeBox.value = colorFuncs.get(colorSelect.value);
};

colorSetButton.onclick = function() {
	colorFuncSource = colorCodeBox.value;
	try {
		compile(formulaBox.value);
	} catch (e) {
		alert("An error occurred. Check console for details.");
		throw e;
	}
	draw();
}

// sliders at bottom-right
document.getElementById("slider-s").oninput = function() {
	paramS = document.getElementById("slider-s").value;
	document.getElementById("reading-s").innerHTML = `s = ${paramS}`;
	draw();
}
document.getElementById("slider-t").oninput = function() {
	paramT = document.getElementById("slider-t").value;
	document.getElementById("reading-t").innerHTML = `t = ${paramT}`;
	draw();
}

let mouseDown = false;
canvas.addEventListener('mousemove', function(e) {
	if (mouseDown) {
		center[0] -= e.movementX * zoom;
		center[1] += e.movementY * zoom;
		draw();
	}
	updateCoords(e);
});
canvas.addEventListener('mousedown', function() {
	mouseDown = true;
});
canvas.addEventListener('mouseup', function() {
	mouseDown = false;
});
canvas.addEventListener('wheel', function(e) {
	if (e.deltaY < 0) {
		zoom /= SCROLL_SENSITIVITY;
	} else {
		zoom *= SCROLL_SENSITIVITY;
	}
	draw();
	updateCoords(e);
});

function updateCoords(e) {
	const rect = canvas.getBoundingClientRect();
	let mx = e.clientX - rect.left;
	let my = rect.bottom - e.clientY;
	let re = (center[0] - rect.width / 2 * zoom) + mx * zoom;
	let im = (center[1] - rect.height / 2 * zoom) + my * zoom;
	coordsBox.innerHTML = `mouse position: ${re.toFixed(14)} + ${im.toFixed(14)}i`;
}

function compile(formula) {
	let allSpecialFuncs = "";
	let exp = parseFormula(formula);
	for (const func of specialFuncInstances) {
		allSpecialFuncs += func[1];
	}

	let vsSource = `
	#define PI 3.1415926535897932384626433832795
	attribute vec2 a_pos;
	uniform vec2 u_res;
	uniform float u_zoom;
	uniform vec2 u_center;
	varying vec2 v_z;

	void main() {
		gl_Position = vec4(a_pos, 0., 1.);
		v_z = u_zoom * (u_res * a_pos) + u_center;
	}
	`;

	let fsSource = `
	#define PI 3.1415926535897932384626433832795
	#define E 2.7182818284590452353602874713527
	#define C_I vec2(0.,1.)
	#define C_ZERO vec2(0.,0.)
	#define C_ONE vec2(1.,0.)
	#define C_TWO vec2(2.,0.)
	#define C_PI vec2(3.1415926535897932384626433832795,0.)
	#define MAX_ITERATIONS 200
	precision highp float;
	uniform float u_s;
	uniform float u_t;
	varying vec2 v_z;
	${allFuncs}
	${allSpecialFuncs}

	vec2 f(vec2 z) {
		return ${exp};
	}

	bool isNan(float val) {
		return (val < 0.0 || 0.0 < val || val == 0.0) ? false : true;
	}

	float _v(float m1, float m2, float hue) {
		if (hue < 0.) hue += 1.;
		if (hue > 1.) hue -= 1.;
		if (hue < 1./6.) return m1 + (m2-m1)*hue*6.;
		if (hue < 0.5) return m2;
		if (hue < 2./3.) return m1 + (m2-m1)*(2./3.-hue)*6.;
		return m1;
	}

	vec3 hsl2rgb(float h, float s, float l){
		float m1 = 0.;
		float m2 = 0.;
		if (s == 0.) return vec3(l, l, l);
		if (l <= 0.5) {
			m2 = l * (1. + s);
		} else {
			m2 = l + s - (l * s);
		}
		m1 = 2. * l - m2;
		return vec3(_v(m1, m2, h + 1./3.), _v(m1, m2, h), _v(m1, m2, h - 1./3.));
	}

	// https://stackoverflow.com/questions/15095909/from-rgb-to-hsv-in-opengl-glsl
	vec3 hsv2rgb(float h, float s, float v) {
		vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
		vec3 p = abs(fract(vec3(h, h, h) + K.xyz) * 6.0 - K.www);
		return v * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), s);
	}

	${colorFuncSource}

	void main() {
		vec2 fz = f(v_z);
		gl_FragColor = vec4(colorFunc(fz), 1.);
	}
	`;

	const program = initShaderProgram(gl, vsSource, fsSource);

	programInfo = {
		program: program,
		attribLocs: {
			pos: gl.getAttribLocation(program, "a_pos")
		},
		uniformLocs: {
			res: gl.getUniformLocation(program, "u_res"),
			zoom: gl.getUniformLocation(program, "u_zoom"),
			center: gl.getUniformLocation(program, "u_center"),
			s: gl.getUniformLocation(program, "u_s"),
			t: gl.getUniformLocation(program, "u_t")
		}
	};

	const posBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
	const positions = [-1, -1, -1, 3, 3, -1];
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

	buffers = {pos: posBuffer};
}

function draw() {
	resize();
	gl.clearColor(0., 0., 0., 1.);
	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.useProgram(programInfo.program);

	gl.bindBuffer(gl.ARRAY_BUFFER, buffers.pos);
	gl.vertexAttribPointer(
		programInfo.attribLocs.pos, 2, gl.FLOAT, false, 0, 0
	);
	gl.enableVertexAttribArray(programInfo.attribLocs.pos);

	gl.uniform2f(programInfo.uniformLocs.res, canvas.clientWidth / 2, canvas.clientHeight / 2);
	gl.uniform1f(programInfo.uniformLocs.zoom, zoom);
	gl.uniform2fv(programInfo.uniformLocs.center, center);
	gl.uniform1f(programInfo.uniformLocs.s, paramS);
	gl.uniform1f(programInfo.uniformLocs.t, paramT);

	gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function resize() {
	let dispWidth = canvas.clientWidth;
	let dispHeight = canvas.clientHeight;
	if (canvas.width != dispWidth || canvas.height != dispHeight) {
		canvas.width = dispWidth;
		canvas.height = dispHeight;
		gl.viewport(0, 0, canvas.width, canvas.height);
	}
}

window.onload = function() {
	compile("z");
	draw();
}
