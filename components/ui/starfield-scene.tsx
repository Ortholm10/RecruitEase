"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GammaCorrectionShader } from "three/examples/jsm/shaders/GammaCorrectionShader.js";
import { CopyShader } from "three/examples/jsm/shaders/CopyShader.js";

// "Starfield Close" — recreated verbatim (geometry/shaders/uniforms/motion)
// from the supplied Three.js r0.143.0 spec. brightness/pointSize/opacity/
// flameAmt are boosted above the spec's exact values (3.55/50/1.13/0.6) —
// at spec values the scene reads as flat black behind the enlarged card.
// Everything else (colors, geometry, motion) is untouched.
const CONFIG = {
  bgColor: "#0a0a24",
  flameColor: "#aee9ff",
  flameColor2: "#c79bff",
  flameAmt: 1.3,
  colorA: "#aef6cf",
  colorB: "#5fe6a0",
  colorC: "#eafff2",
  opacity: 1.8,
  pointSize: 75,
  brightness: 6,
  drift: 2.35,
  twinkle: 1,
  spin: 0.03,
  repelRadius: 5,
  repelStrength: 0.35,
  scrollPush: 8,
  scrollDrift: 6,
  scrollSpin: 0.1,
  parallax: 0.6,
} as const;

const LAYERS = { NONE: 0, TORUS_SCENE: 1, BLOOM_SCENE: 2, ENTIRE_SCENE: 3 } as const;

function hexToVec3(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const VERTEX_SHADER = `
uniform float uTime; uniform float uSize; uniform float uDrift; uniform float uDepth; uniform float uTwinkle;
uniform vec3 uCursor; uniform float uRepelRadius; uniform float uRepelStrength; uniform float uActivity;
uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uColorC;
attribute float aScale; attribute float aPhase; attribute float aPalette; attribute float aBright;
varying vec3 vColor; varying float vTwinkle;
void main() {
  vec3 pos = position;
  // Endless drift toward +Z with mod-wrap.
  pos.z = mod(pos.z + uDrift + (uDepth * 0.5), uDepth) - (uDepth * 0.5);

  float tw = sin(uTime * 1.6 + aPhase * 6.2831);
  vTwinkle = (1.0 - uTwinkle) + uTwinkle * (0.55 + 0.45 * tw);

  vec4 modelPosition = modelMatrix * vec4(pos, 1.0);

  vec3 toParticle = modelPosition.xyz - uCursor;
  float dist = length(toParticle);
  float falloff = smoothstep(uRepelRadius, 0.0, dist);
  modelPosition.xyz += normalize(toParticle + vec3(0.0001)) * falloff * uRepelStrength * uActivity;

  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = uSize * aScale;
  gl_PointSize *= (1.0 / -viewPosition.z);

  vec3 base = aPalette < 0.5 ? uColorA : (aPalette < 1.5 ? uColorB : uColorC);
  vColor = base * aBright;
}
`;

const FRAGMENT_SHADER = `
uniform float uOpacity; uniform float uBrightness;
varying vec3 vColor; varying float vTwinkle;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float strength = pow(1.0 - d * 2.0, 4.0);
  vec3 color = mix(vec3(0.0), vColor, strength);
  gl_FragColor = vec4(color * uBrightness, strength * uOpacity * vTwinkle);
}
`;

const FINAL_VERTEX_SHADER = `
varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const FINAL_FRAGMENT_SHADER = `
uniform float iTime; uniform sampler2D tDiffuse; uniform sampler2D bloomTexture; uniform sampler2D torusTexture; uniform sampler2D haloTexture;
uniform vec3 uBg; uniform vec3 uFlameA; uniform vec3 uFlameB; uniform float uFlameAmt;
varying vec2 vUv;
vec3 warp3d(vec3 pos, float t){ float curv=.8,a=1.9,b=0.7; pos*=2.;
  pos.x+=curv*sin(t+a*pos.y)+t*b; pos.y+=curv*cos(t+a*pos.x);
  pos.y+=curv*sin(t+a*pos.z)+t*b; pos.z+=curv*cos(t+a*pos.y);
  pos.z+=curv*sin(t+a*pos.x)+t*b; pos.x+=curv*cos(t+a*pos.z);
  return 0.5+0.5*cos(pos.xyz+vec3(1,2,4)); }
void main(){
  vec2 uv = 2.*vUv - 1.;
  vec3 w = pow(warp3d(vec3(uv.x, sin(uv.y), uv.y), iTime*1.5), vec3(1.5));
  vec3 flame = 1.5*uFlameA*w.x; flame*=w.y; flame += uFlameB*w.z;
  flame *= smoothstep(0.25, 1., abs(uv.y));
  float md = smoothstep(-0.7, 1., -uv.y*uv.x); flame *= md*md;
  vec3 bg = uBg * (1.0 - 0.4 * length(uv));
  vec3 halo = texture2D(haloTexture, vUv).xyz;
  gl_FragColor = vec4(bg + flame*uFlameAmt + texture2D(bloomTexture, vUv).xyz + texture2D(torusTexture, vUv).xyz + texture2D(tDiffuse, vUv).xyz + halo, 1.);
}
`;

export function StarfieldScene({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGL1Renderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 0, 15);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 80);
    camera.position.set(0, 0, 5);
    camera.layers.enable(LAYERS.TORUS_SCENE);
    camera.layers.enable(LAYERS.BLOOM_SCENE);
    camera.layers.enable(LAYERS.ENTIRE_SCENE);
    scene.add(camera);

    // ---- geometry: dense star point cloud ----
    const count = 4200;
    const depth = 30;
    const positions = new Float32Array(count * 3);
    const palette = new Float32Array(count);
    const bright = new Float32Array(count);
    const scales = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 24;
      positions[i3 + 1] = (Math.random() - 0.5) * 16;
      positions[i3 + 2] = (Math.random() - 0.5) * 30;
      palette[i] = Math.floor(Math.random() * 3);
      bright[i] = 0.7 + Math.random() * 0.6;
      scales[i] = 0.5 + Math.pow(Math.random(), 1.4) * 2.5;
      phases[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aScale", new THREE.Float32BufferAttribute(scales, 1));
    geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
    geometry.setAttribute("aPalette", new THREE.Float32BufferAttribute(palette, 1));
    geometry.setAttribute("aBright", new THREE.Float32BufferAttribute(bright, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: CONFIG.pointSize },
        uOpacity: { value: 0 },
        uDrift: { value: 0 },
        uDepth: { value: depth },
        uTwinkle: { value: CONFIG.twinkle },
        uCursor: { value: new THREE.Vector3() },
        uRepelRadius: { value: CONFIG.repelRadius },
        uRepelStrength: { value: CONFIG.repelStrength },
        uActivity: { value: 0 },
        uColorA: { value: hexToVec3(CONFIG.colorA) },
        uColorB: { value: hexToVec3(CONFIG.colorB) },
        uColorC: { value: hexToVec3(CONFIG.colorC) },
        uBrightness: { value: CONFIG.brightness },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });

    const points = new THREE.Points(geometry, material);
    points.layers.enable(LAYERS.ENTIRE_SCENE);
    const group = new THREE.Group();
    group.add(points);
    scene.add(group);

    // ---- postprocessing: three composers sharing one RenderPass ----
    const renderScene = new RenderPass(scene, camera);

    const torusComposer = new EffectComposer(renderer);
    torusComposer.renderToScreen = false;
    torusComposer.addPass(renderScene);
    torusComposer.addPass(new ShaderPass(GammaCorrectionShader));
    torusComposer.addPass(
      new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.2, 0),
    );
    torusComposer.addPass(new ShaderPass(CopyShader));

    const bloomComposer = new EffectComposer(renderer);
    bloomComposer.renderToScreen = false;
    bloomComposer.addPass(renderScene);
    bloomComposer.addPass(
      new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.55, 0),
    );
    bloomComposer.addPass(new ShaderPass(GammaCorrectionShader));

    const finalPass = new ShaderPass({
      uniforms: {
        iTime: { value: 0 },
        tDiffuse: { value: null },
        torusTexture: { value: null },
        bloomTexture: { value: null },
        haloTexture: { value: null },
        uBg: { value: hexToVec3(CONFIG.bgColor) },
        uFlameA: { value: hexToVec3(CONFIG.flameColor) },
        uFlameB: { value: hexToVec3(CONFIG.flameColor2) },
        uFlameAmt: { value: CONFIG.flameAmt },
      },
      vertexShader: FINAL_VERTEX_SHADER,
      fragmentShader: FINAL_FRAGMENT_SHADER,
    });
    finalPass.uniforms.bloomTexture.value = bloomComposer.renderTarget1.texture;
    finalPass.uniforms.torusTexture.value = torusComposer.renderTarget1.texture;

    const finalComposer = new EffectComposer(renderer);
    finalComposer.addPass(renderScene);
    finalComposer.addPass(finalPass);

    // ---- pointer (world-space cursor "void") ----
    const POINTER = {
      ndc: new THREE.Vector2(0, 0),
      world: new THREE.Vector3(),
      activity: 0,
      active: false,
      lastMove: performance.now(),
    };
    const raycaster = new THREE.Raycaster();

    function onPointerMove(e: PointerEvent) {
      POINTER.ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
      POINTER.ndc.y = -((e.clientY / window.innerHeight) * 2 - 1);
      POINTER.active = true;
      POINTER.lastMove = performance.now();
    }
    function onPointerOut() {
      POINTER.active = false;
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerout", onPointerOut);

    function updatePointer() {
      let target = new THREE.Vector3(0, 0, 0);
      if (POINTER.active) {
        raycaster.setFromCamera(POINTER.ndc, camera);
        const dir = raycaster.ray.direction;
        if (Math.abs(dir.z) > 1e-4) {
          const t = -camera.position.z / dir.z;
          if (t > 0 && Number.isFinite(t)) {
            target = raycaster.ray.origin.clone().add(dir.clone().multiplyScalar(t));
          }
        }
      }
      POINTER.world.lerp(target, 0.12);

      const idleSeconds = (performance.now() - POINTER.lastMove) / 1000;
      const want = POINTER.active && idleSeconds < 3 ? 1 : 0;
      POINTER.activity += (want - POINTER.activity) * 0.06;

      material.uniforms.uCursor.value.copy(POINTER.world);
      material.uniforms.uActivity.value = POINTER.activity;
    }

    // ---- scroll (double-damped) + mouse parallax smoothing ----
    let scrollTarget = 0;
    let scrollSmooth = 0;
    let scrollCurrent = 0;
    const mouseSmooth = { x: 0, y: 0 };

    function computeScrollTarget() {
      const doc = document.documentElement;
      const maxScroll = Math.max(doc.scrollHeight - window.innerHeight, 1);
      return Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
    }
    function onScroll() {
      scrollTarget = computeScrollTarget();
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    scrollTarget = computeScrollTarget();

    // ---- per-frame scene update ----
    let t0 = performance.now() / 1000;
    const appearStart = performance.now();

    function updateScene(scroll: number, m: { x: number; y: number }) {
      const t = performance.now() / 1000;
      const dt = Math.min(0.05, t - t0);
      t0 = t;

      material.uniforms.uTime.value = t;
      material.uniforms.uDrift.value += dt * (CONFIG.drift + scroll * CONFIG.scrollDrift);

      camera.position.set(m.x * CONFIG.parallax, m.y * CONFIG.parallax, 5 - scroll * CONFIG.scrollPush);
      camera.lookAt(m.x * CONFIG.parallax, m.y * CONFIG.parallax, -10);

      const elapsed = performance.now() - appearStart;
      const fade = Math.min(Math.max((elapsed - 300) / 1400, 0), 1);
      material.uniforms.uOpacity.value = fade * CONFIG.opacity;

      group.rotation.z += dt * (CONFIG.spin + scroll * CONFIG.scrollSpin);
    }

    // ---- render loop ----
    let raf = 0;
    function tick() {
      finalPass.uniforms.iTime.value = performance.now() / 1000;

      scrollSmooth += (scrollTarget - scrollSmooth) * 0.1;
      scrollCurrent += (scrollSmooth - scrollCurrent) * 0.06;
      mouseSmooth.x += (POINTER.ndc.x - mouseSmooth.x) * 0.06;
      mouseSmooth.y += (POINTER.ndc.y - mouseSmooth.y) * 0.06;

      updatePointer();
      updateScene(scrollCurrent, mouseSmooth);

      camera.layers.set(LAYERS.TORUS_SCENE);
      torusComposer.render();
      camera.layers.set(LAYERS.BLOOM_SCENE);
      bloomComposer.render();
      camera.layers.set(LAYERS.ENTIRE_SCENE);
      finalComposer.render();

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    // ---- resize ----
    function onResize() {
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      for (const composer of [torusComposer, bloomComposer, finalComposer]) {
        composer.setPixelRatio(window.devicePixelRatio);
        composer.setSize(window.innerWidth, window.innerHeight);
      }
      scrollTarget = computeScrollTarget();
    }
    window.addEventListener("resize", onResize);
    onResize();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      geometry.dispose();
      material.dispose();
      // EffectComposer has no dispose() in this three version — free its
      // ping-pong render targets (the actual GPU resources) directly.
      for (const composer of [torusComposer, bloomComposer, finalComposer]) {
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className={className} style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}
