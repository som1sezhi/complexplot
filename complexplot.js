const SCROLL_SENSITIVITY = 1.2;
const DEFAULT_ZOOM = 0.01;

const canvas = document.getElementById("canvas");
const gl = canvas.getContext("webgl");

// ----- glsl source code strings -----
let colorFuncSource = colorFuncs.get("HSL, arctan");
let allFuncs = "";
for (const func of funcs) {
	allFuncs += func[1];
}
let paramsSource = "";

// ----- program, and program state -----
let programInfo, buffers;
let zoom = DEFAULT_ZOOM;
let center = [0, 0];
let currentFormula = "z";

// ----- document elements -----
const formulaBox = document.getElementById("formula-box");
const goButton = document.getElementById("go-button");
const resetZoomButton = document.getElementById("reset-zoom-button");
const coordsBox = document.getElementById("coords-box");
const colorSelect = document.getElementById("color-select");
for (const func of colorFuncs) { // populate color func drop-down
	const opt = document.createElement("option");
	opt.text = func[0];
	colorSelect.add(opt);
}
const colorCodeBox = document.getElementById("color-code-box");
const colorSetButton = document.getElementById("color-set-button");
colorCodeBox.value = colorFuncSource;
const shareModal = document.getElementById("share-modal");
const shareSuccess = document.getElementById("share-successful-message");


// ----- top box functionality -----
goButton.onclick = function() {
	try {
		compile(formulaBox.value);
	} catch (e) {
		alert("An error occurred. Check console for details.");
		throw e;
	}
	currentFormula = formulaBox.value;
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

// ----- color options functionality -----
colorSelect.onchange = function() {
	colorCodeBox.value = colorFuncs.get(colorSelect.value);
}
colorSetButton.onclick = function() {
	colorFuncSource = colorCodeBox.value;
	try {
		compile(currentFormula);
	} catch (e) {
		alert("An error occurred. Check console for details.");
		throw e;
	}
	draw();
}

// ----- parameters functionality -----
document.getElementById("add-param-button").onclick = function() {
	addParameter();
};

// ----- navigation functionality -----
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

// ----- sharing functionality -----
document.getElementById("share-button").onclick = function() {
	shareModal.style.display = "block";
}
document.getElementById("copy-link-button").onclick = function() {
	let includeColor = document.getElementById("share-color-checkbox").checked;
	let link = generateShareLink(includeColor);
	navigator.clipboard.writeText(link)
		.then(function() {
			shareSuccess.style.color = "#66ff66";
			shareSuccess.innerHTML = "Successfully copied link"
		}).catch(function() {
			shareSuccess.style.color = "#ff6666";
			shareSuccess.innerHTML = "Copy failed"
		});
}
/*document.getElementById("close-modal-button").onclick = function() {
	shareModal.style.display = "none";
	shareSuccess.innerHTML = "";
}*/
window.addEventListener("click", function(e) {
	if (e.target == shareModal) {
		shareModal.style.display = "none";
	}
	shareSuccess.innerHTML = "";
});

window.addEventListener("resize", function() {
	resize();
	draw();
});

const slider2Params = new Map();
// update uniform parameter source code
function updateParamsSource() {
	paramsSource = "";
	for (const p of slider2Params) {
		paramsSource += "uniform float u_" + p[1].name + ";\n";
	}
}
function updateReading(slider, reading) {
	let param = slider2Params.get(slider);
	reading.innerHTML = `${param.name} = ${+lerp(param.min, param.max, param.val).toFixed(14)}`;
}
function lerp(v0, v1, t) {
	return v0 + t * (v1 - v0);
}
function addParameter(paramObj) {
	if (!paramObj) {
		paramObj = {
			min: 0,
			max: 1,
			val: 0
		};
		let id = 0;
		function isNameTaken(name) {
			for (const p of slider2Params) {
				if (p[1].name == name) return true;
			}
			return false;
		}
		while (isNameTaken("p" + id)) id++;
		paramObj.name = "p" + id;
	}

	const paramDiv = document.createElement("div");
	const paramNameBox = document.createElement("input");
	const paramMinBox = document.createElement("input");
	const paramMaxBox = document.createElement("input");
	const paramRemoveButton = document.createElement("button");
	const paramSliderDiv = document.createElement("div");
	const paramSlider = document.createElement("input");
	const paramReading = document.createElement("span");

	paramDiv.className = "param-item";

	paramNameBox.type = "text";
	paramNameBox.value = paramObj.name;
	paramNameBox.onchange = function() {
		let newName = paramNameBox.value;
		if (!(/^[a-zA-Z][a-zA-Z0-9]*$/.test(newName))) {
			alert("A parameter name must contain only alphanumeric characters. The name should not begin with a digit.");
			paramNameBox.value = slider2Params.get(paramSlider).name;
			return;
		}
		try {
			addParamToken(newName);
		} catch {
			alert("A token with that name already exists. Please choose another name.");
			paramNameBox.value = slider2Params.get(paramSlider).name;
			return;
		}
		removeParamToken(slider2Params.get(paramSlider).name);
		slider2Params.get(paramSlider).name = newName;
		updateReading(paramSlider, paramReading);
		updateParamsSource();
	}
	slider2Params.set(paramSlider, paramObj);

	paramMinBox.type = "number";
	paramMinBox.className = "param-bounds";
	paramMinBox.value = paramObj.min;
	paramMinBox.onchange = function() {
		if (isNaN(parseFloat(paramMinBox.value))) paramMinBox.value = 0;
		slider2Params.get(paramSlider).min = parseFloat(paramMinBox.value);
		updateReading(paramSlider, paramReading);
		draw();
	}
	paramMaxBox.type = "number";
	paramMaxBox.className = "param-bounds";
	paramMaxBox.value = paramObj.max;
	paramMaxBox.onchange = function() {
		if (isNaN(parseFloat(paramMaxBox.value))) paramMaxBox.value = 0;
		slider2Params.get(paramSlider).max = parseFloat(paramMaxBox.value);
		updateReading(paramSlider, paramReading);
		draw();
	}

	paramRemoveButton.type = "button";
	paramRemoveButton.onclick = function() {
		removeParamToken(slider2Params.get(paramSlider).name);
		slider2Params.delete(paramSlider);
		paramDiv.remove();
		paramSliderDiv.remove();
		updateParamsSource();
	}
	paramRemoveButton.className = "param-remove-button";
	paramRemoveButton.innerHTML = "&times;";

	paramSlider.type = "range";
	paramSlider.min = 0;
	paramSlider.max = 1;
	paramSlider.step = 0.001;
	paramSlider.value = paramObj.val;
	paramSlider.oninput = function() {
		let val = parseFloat(paramSlider.value);
		slider2Params.get(paramSlider).val = val;
		updateReading(paramSlider, paramReading);
		draw();
	}

	updateReading(paramSlider, paramReading);
	addParamToken(paramNameBox.value);
	updateParamsSource();

	paramDiv.appendChild(paramNameBox);
	paramDiv.appendChild(paramMinBox);
	paramDiv.appendChild(paramMaxBox);
	paramDiv.appendChild(paramRemoveButton);
	document.getElementById("params-list").appendChild(paramDiv);
	paramSliderDiv.appendChild(paramSlider);
	paramSliderDiv.appendChild(paramReading);
	document.getElementById("parameters-box").appendChild(paramSliderDiv);
}

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
	${paramsSource}
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
			center: gl.getUniformLocation(program, "u_center")
		}
	};
	for (const p of slider2Params) {
		const pName = p[1].name;
		programInfo.uniformLocs[pName] = gl.getUniformLocation(program, "u_" + pName);
	}

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
	//gl.uniform1f(programInfo.uniformLocs.s, paramS);
	//gl.uniform1f(programInfo.uniformLocs.t, paramT);
	for (const p of slider2Params) {
		let val = lerp(p[1].min, p[1].max, p[1].val);
		gl.uniform1f(programInfo.uniformLocs[p[1].name], val);
	}

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

function generateShareLink(shareColor) {
	let state = {
		formula: currentFormula,
		params: [],
		center: center,
		zoom: zoom
	}
	if (shareColor) {
		state.colorFunc = colorFuncSource;
		state.colorFuncSelect = colorSelect.value;
	}
	for (const sliderDiv of document.getElementById("parameters-box").children) {
		const slider = sliderDiv.querySelector("input[type=range]");
		state.params.push(slider2Params.get(slider));
	}
	let str = lzbase62.compress(JSON.stringify(state));
	return location.protocol + "//" + location.hostname + location.pathname + "?s=" + str;
}

function runFromStateObj(state) {
	formulaBox.value = state.formula;
	center = state.center;
	zoom = state.zoom;
	for (const p of state.params) {
		addParameter(p);
	}
	if (state.colorFunc) {
		colorSelect.value = state.colorFuncSelect;
		colorCodeBox.value = state.colorFunc;
		colorFuncSource = state.colorFunc;
	} else {
		colorSelect.value = "HSL, arctan";
		colorFuncSource = colorFuncs.get("HSL, arctan");
		colorCodeBox.value = colorFuncSource;
	}
	goButton.click();
}

window.onload = function() {
	let stateData = new URLSearchParams(window.location.search).get("s");
	if (stateData) {
		try {
			let state = JSON.parse(lzbase62.decompress(stateData));
			runFromStateObj(state);
		} catch(e) {
			alert("An error occurred. Check console for details.");
			document.getElementById("parameters-box").innerHTML = "";
			document.getElementById("params-list").innerHTML = "";
			paramsSource = "";
			runFromStateObj({
				formula: "z",
				zoom: DEFAULT_ZOOM,
				center: [0, 0],
				params: []
			});
			throw e;
		}
	} else { // default to z
		compile(currentFormula);
		draw();
	}
}
