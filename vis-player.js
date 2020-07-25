import * as THREE from "./threejs/build/three.module.js";
import { GUI } from "./threejs/examples/jsm/libs/dat.gui.module.js";
import { OrbitControls } from "./threejs/examples/jsm/controls/OrbitControls.js";
import { NRRDLoader } from "./threejs/examples/jsm/loaders/NRRDLoader.js";
import { VolumeRenderShader1 } from "./threejs/examples/jsm/shaders/VolumeShader.js";
import { WEBGL } from "./threejs/examples/jsm/WebGL.js";

var renderer, scene, camera, controls, material, volconfig, cmtextures;

function findFormat(dtype) {
  console.log(dtype);
  let regex = /(u*)(int|float)(\d+)/gi;
  let format = regex.exec(dtype);
  console.log(format);
  if (format[3] == 8) {
    dtype = ["THREE.UnsignedByteType", "THREE.RedFormat"];
  }
  if (format[3] == 16) {
    dtype = ["THREE.UnsignedShort4444Type", "THREE.RGBAFormat"];
  }

  if (format[3] == 32) {
    dtype = ["THREE.UnsignedByteType", "THREE.RGBAFormat"];
  }

  return dtype;
}

export default function crossdatacheck(data, dtype, dims) {
  console.log(data.length);
  console.log(data);
  // dims[2]=128;
  scene = new THREE.Scene();

  var canvasElements = document.getElementsByTagName("canvas");
  var controlElements = document.getElementsByClassName("dg main a");

  if (canvasElements.length > 0) {
    for (var i = 0, length = canvasElements.length; i < length; i++) {
      canvasElements[i].hidden = true;
      // controlElements[i].hidden = true;
      console.log(" canvas element was found and hidden");
    }
  }

  if (controlElements.length > 0) {
    for (var i = 0, length = controlElements.length; i < length; i++) {
      controlElements[i].hidden = true;
      console.log("control elements was found");
    }
  }

  let format = findFormat(dtype);
  // Create renderer
  var canvas = document.createElement("canvas");
  var context = canvas.getContext("webgl2", { alpha: true, antialias: false });
  renderer = new THREE.WebGLRenderer({ canvas: canvas, context: context });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Create camera (The volume renderer does not work very well with perspective yet)
  var h = 700; // frustum height
  var aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.OrthographicCamera(
    (-h * aspect) / 2,
    (h * aspect) / 2,
    h / 2,
    -h / 2,
    -100,
    1000
  );
  camera.position.set(100, 800, 200);
  camera.up.set(0, 0, 1); // In our data, z is up

  // Create controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener("change", render);
  controls.target.set(64, 64, 128);
  controls.minZoom = 0.5;
  controls.maxZoom = 4;
  controls.update();

  // scene.add( new AxesHelper( 128 ) );

  // Lighting is baked into the shader a.t.m.
  // var dirLight = new DirectionalLight( 0xffffff );

  // The gui for interaction
  volconfig = {
    clim1: 0,
    clim2: 1,
    renderstyle: "iso",
    isothreshold: 0.22,
    colormap: "viridis",
  };
  var gui = new GUI();
  gui.add(volconfig, "clim1", 0, 1, 0.01).onChange(updateUniforms);
  gui.add(volconfig, "clim2", 0, 1, 0.01).onChange(updateUniforms);
  gui
    .add(volconfig, "colormap", {
      gray: "gray",
      viridis: "viridis",
      smooth_cool_warm: "smooth_cool_warm",
    })
    .onChange(updateUniforms);
  gui
    .add(volconfig, "renderstyle", { mip: "mip", iso: "iso" })
    .onChange(updateUniforms);
  gui.add(volconfig, "isothreshold", 0, 1, 0.01).onChange(updateUniforms);

  // THREEJS will select R32F (33326) based on the THREE.RedFormat and THREE.FloatType.
  // Also see https://www.khronos.org/registry/webgl/specs/latest/2.0/#TEXTURE_TYPES_FORMATS_FROM_DOM_ELEMENTS_TABLE
  // TODO: look the dtype up in the volume metadata
  console.log(dims[0], dims[1], dims[2]);
  var texture = new THREE.DataTexture3D(data, dims[0], dims[1], dims[2]);
  texture.format = eval(format[1]);
  texture.type = eval(format[0]);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  // texture.internalFormat = 'RG16UI';
  // Colormap textures
  cmtextures = {
    viridis: new THREE.TextureLoader().load(
      "threejs/examples/textures/cm_viridis.png",
      render
    ),
    gray: new THREE.TextureLoader().load(
      "threejs/examples/textures/cm_gray.png",
      render
    ),
    smooth_cool_warm: new THREE.TextureLoader().load(
      "threejs/examples/textures/Cool2WarmBar.png",
      render
    ),
  };

  // Material
  var shader = VolumeRenderShader1;
  console.log(texture);
  var uniforms = THREE.UniformsUtils.clone(shader.uniforms);

  uniforms["u_data"].value = texture;
  uniforms["u_size"].value.set(dims[0], dims[1], dims[2]);
  uniforms["u_clim"].value.set(volconfig.clim1, volconfig.clim2);
  uniforms["u_renderstyle"].value = volconfig.renderstyle == "mip" ? 0 : 1; // 0: MIP, 1: ISO
  uniforms["u_renderthreshold"].value = volconfig.isothreshold; // For ISO renderstyle
  uniforms["u_cmdata"].value = cmtextures[volconfig.colormap];

  material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    side: THREE.BackSide, // The volume shader uses the backface as its "reference point"
  });

  material.transparent = true;
  material.blending = THREE.CustomBlending;

  // THREE.Mesh
  var geometry = new THREE.BoxBufferGeometry(dims[0], dims[1], dims[2]);
  geometry.translate(dims[0] / 2 - 0.5, dims[1] / 2 - 0.5, dims[2] / 2 - 0.5);

  var mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  render();
}

// window.addEventListener( 'resize', onWindowResize, false );

function updateUniforms() {
  material.uniforms["u_clim"].value.set(volconfig.clim1, volconfig.clim2);
  material.uniforms["u_renderstyle"].value =
    volconfig.renderstyle == "mip" ? 0 : 1; // 0: MIP, 1: ISO
  material.uniforms["u_renderthreshold"].value = volconfig.isothreshold; // For ISO renderstyle
  material.uniforms["u_cmdata"].value = cmtextures[volconfig.colormap];

  render();
}

function onWindowResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);

  var aspect = window.innerWidth / window.innerHeight;

  var frustumHeight = camera.top - camera.bottom;

  camera.left = (-frustumHeight * aspect) / 2;
  camera.right = (frustumHeight * aspect) / 2;

  camera.updateProjectionMatrix();

  render();
}

function render() {
  renderer.render(scene, camera);
}
