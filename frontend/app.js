(function () {
  'use strict';

  // === API BASE URL ===
  // Détecte automatiquement si le site est ouvert via Live Server (5500)
  // ou directement via le backend Express (3000).
  // Si Live Server est détecté, on redirige les appels vers le bon port (3000).
  const API_BASE = (window.location.port === '5500' || window.location.port === '5501')
    ? 'http://localhost:3000'
    : (window.API_BASE || '');

  // === LOADING SCREEN ===
  function runLoading() {
    return new Promise(resolve => {
      const bar = document.getElementById('loader-bar'), pct = document.getElementById('loader-percent'), screen = document.getElementById('loading-screen');
      const paths = document.querySelectorAll('#loader-logo .hex-path,#loader-logo .robot-body,#loader-logo .wheel-l,#loader-logo .wheel-r,#loader-logo .antenna-line,#loader-logo .antenna-tip,#loader-logo .leaf-path');
      const tl = gsap.timeline();
      tl.to(paths, { strokeDashoffset: 0, duration: 1.8, stagger: 0.12, ease: 'power2.inOut' });
      tl.to('#loader-logo .robot-body', { fill: '#2D6A4F', duration: .3 }, '-=.4');
      tl.to('#loader-logo .wheel-l,#loader-logo .wheel-r', { fill: '#1a1a1a', duration: .3 }, '-=.3');
      tl.to('#loader-logo .antenna-tip', { fill: '#00D4AA', duration: .3 }, '-=.3');
      const fr = document.getElementById('loader-text-fr'), ar = document.getElementById('loader-text-ar');
      const frt = fr.textContent, art = ar.textContent;

      // French text: character-by-character reveal (safe for Latin)
      fr.textContent = ''; fr.style.opacity = '1';
      [...frt].forEach(c => { const s = document.createElement('span'); s.textContent = c; s.style.opacity = '0'; s.style.display = 'inline-block'; if (c === ' ') s.style.width = '4px'; fr.appendChild(s) });

      // Arabic text: animate the whole element — splitting into spans destroys
      // Arabic ligature shaping and breaks RTL character joining
      ar.textContent = art; ar.style.opacity = '0';

      tl.to(fr.children, { opacity: 1, duration: .03, stagger: .03 }, '-=.6');
      tl.to(ar, { opacity: 1, duration: 0.5, ease: 'power2.out' }, '-=.2');
      let prog = { v: 0 };
      tl.to(prog, { v: 100, duration: 2.5, ease: 'power1.inOut', onUpdate: () => { const p = Math.round(prog.v); bar.style.width = p + '%'; pct.textContent = p + '%' } }, 0);

      // Safety: force-dismiss after 6s in case GSAP stalls (CDN timeout, etc.)
      const safetyTimer = setTimeout(() => {
        screen.style.display = 'none'; screen.style.pointerEvents = 'none'; resolve();
      }, 6000);

      tl.to(screen, { opacity: 0, scale: 1.1, duration: .7, ease: 'power3.inOut', delay: .2,
        onStart: () => { screen.style.pointerEvents = 'none'; },
        onComplete: () => { clearTimeout(safetyTimer); screen.style.display = 'none'; resolve(); } });
    });
  }

  // === THREE.JS GLOBALS ===
  let scene, camera, renderer, clock, robotGroup, particleSystem;
  let mouseX = 0, mouseY = 0;
  let terrainMesh, vegMat1, vegMat2;
  let modelLoaded = false;
  const camPositions = [
    { p: [0, 2.5, 6], t: [0, 1.0, 0] },    // Phase 1: intro — wide shot
    { p: [0, 1.8, 3.5], t: [0, 1.0, 0] },  // Phase 2: zoom in
    { p: [2, 2, 4], t: [0, 1.0, 0] },      // Phase 3: specs side angle
    { p: [0, 3, 5.5], t: [0, 0.8, 0] },    // Phase 4: features — slight above
    { p: [-2, 2.5, 5], t: [0, 1.0, 0] },   // Phase 5: mission — left angle
    { p: [0, 4, 6], t: [0, 0.5, 0] },      // Phase 6: terrain — bird's eye
    { p: [0, 2, 5], t: [0, 1.0, 0] },      // Phase 7: stats — clean front
  ];
  let currentCamPos = { px: 0, py: 2.5, pz: 6, tx: 0, ty: 1.0, tz: 0 };
  let explodeAmount = 0, terrainGreen = 0;

  function initScene() {
    const canvas = document.getElementById('hero-canvas');
    const w = window.innerWidth, h = window.innerHeight;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0D1B2A, 0.04);
    camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    camera.position.set(4, 4.5, 7); camera.lookAt(0, -0.3, 0);
    clock = new THREE.Clock();
    // Lights
    scene.add(new THREE.AmbientLight(0x1A472A, 0.5));
    const sun = new THREE.DirectionalLight(0xF4A261, 1.2);
    sun.position.set(5, 8, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const cyan = new THREE.PointLight(0x00D4AA, 2, 8); cyan.position.set(0, 1.5, 0); scene.add(cyan);
    scene.add(new THREE.PointLight(0x1E3A5F, 1.5, 12).translateX(-4).translateY(3));
    buildTerrain(); loadRobot(); buildVegetation(); buildParticles(); buildSky();
  }

  function buildTerrain() {
    const geo = new THREE.PlaneGeometry(30, 30, 80, 80); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, Math.sin(z * 1.2) * 0.08 + Math.cos(x * 0.8 + z * 0.5) * 0.05 + (Math.random() - 0.5) * 0.03);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.95, metalness: 0.05 });
    terrainMesh = new THREE.Mesh(geo, mat); terrainMesh.receiveShadow = true; scene.add(terrainMesh);
    for (let i = -12; i <= 12; i += 1.5) {
      const lg = new THREE.PlaneGeometry(30, 0.15); lg.rotateX(-Math.PI / 2);
      const lm = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: 0x4a3328, roughness: 1 }));
      lm.position.set(0, 0.01, i); scene.add(lm);
    }
  }

  function loadRobot() {
    const loader = new THREE.GLTFLoader();
    loader.load('model%203D/agricultural_robot.glb',
      function (gltf) {
        robotGroup = gltf.scene;

        // ── Phase 4: Remove Stacy BEFORE bounding box so she doesn't affect sizing ──
        const toRemove = [];
        robotGroup.traverse(function (child) {
          if (child.name.includes('Stacy') || child.name === 'Mesh1') {
            toRemove.push(child);
          }
        });
        toRemove.forEach(child => {
          if (child.parent) child.parent.remove(child);
        });

        // ── Add to scene so world-space bbox works ──
        scene.add(robotGroup);

        // ── Auto-scale: fit robot in 3-unit cube ──
        robotGroup.scale.setScalar(1);
        const box = new THREE.Box3().setFromObject(robotGroup);
        const size = new THREE.Vector3();
        box.getSize(size);
        const scaleFactor = 3.0 / Math.max(size.x, size.y, size.z);
        robotGroup.scale.setScalar(scaleFactor);

        // ── Re-center after scaling ──
        const box2 = new THREE.Box3().setFromObject(robotGroup);
        const size2 = new THREE.Vector3();
        box2.getSize(size2);
        const center2 = new THREE.Vector3();
        box2.getCenter(center2);

        // Place bottom of robot exactly on terrain (y = 0)
        // Since we are rotating the group by Math.PI, the local center (-center2.x, -center2.z) 
        // gets flipped. To place the visual center at (0, baseY, 0), we must position the group at (center2.x, baseY, center2.z).
        const baseY = -box2.min.y + 0.05;
        robotGroup.position.set(center2.x, baseY, center2.z);
        robotGroup.rotation.y = Math.PI; // face camera

        // Enable shadows
        robotGroup.traverse(function (child) {
          if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
        });

        // ── Store ALL userData in ONE object (never overwrite) ──
        const ud = {
          wheels: [], frontarms: [], armParts: [],
          origPos: {}, baseY: baseY, baseRotY: Math.PI,
          body: null, robotArm: null, robotComponent: null
        };
        robotGroup.traverse(function (child) {
          const n = child.name;
          if (n.match(/^wheel\d/)) {
            ud.wheels.push(child);
            child.traverse(c => {
              if (c.isMesh) {
                c.geometry.computeBoundingBox();
                const center = new THREE.Vector3();
                c.geometry.boundingBox.getCenter(center);
                c.geometry.translate(-center.x, -center.y, -center.z);
                c.position.copy(center);
                // Phase 6: Dark Gray wheels
                if(c.material) {
                  c.material = c.material.clone();
                  c.material.color.setHex(0x1A1A1A);
                  c.material.roughness = 0.9;
                }
              }
            });
            ud.origPos[n] = child.position.clone();
          } else if (n.match(/^frontarm\d/)) {
            ud.frontarms.push(child);
            ud.origPos[n] = child.position.clone();
            // Phase 6: Mechanical parts dark gray
            child.traverse(c => { if(c.isMesh && c.material) { c.material=c.material.clone(); c.material.color.setHex(0x222222); }});
          } else if (n.match(/^Group\d/)) {
            ud.armParts.push(child);
            ud.origPos[n] = child.position.clone();
          } else if (n === 'Mesh17') {
            ud.body = child;
            ud.origPos[n] = child.position.clone();
            // Phase 6: Chassis Green
            if(child.material) {
              child.material = child.material.clone();
              child.material.color.setHex(0x2D6A4F);
              child.material.roughness = 0.4;
            }
          } else if (n === 'robot_arm1') {
            ud.robotArm = child;
            ud.origPos[n] = child.position.clone();
          } else if (n === 'Component_1_1') {
            ud.robotComponent = child;
            ud.origPos[n] = child.position.clone();
          }
        });
        robotGroup.userData = ud;

        // ── Phase 5: Add Agricultural Primitives ──
        addAgriculturalComponents(robotGroup, ud);

        modelLoaded = true;
        console.log('✅ GLB loaded | scale:' + scaleFactor.toFixed(3) +
          ' | size:' + size2.x.toFixed(2) + 'x' + size2.y.toFixed(2) + 'x' + size2.z.toFixed(2) +
          ' | baseY:' + baseY.toFixed(2) +
          ' | wheels:' + ud.wheels.length + ' | arms:' + ud.frontarms.length);
      },
      function (xhr) { if (xhr.total > 0) console.log('Loading: ' + (xhr.loaded / xhr.total * 100).toFixed(0) + '%'); },
      function (err) { console.error('GLB load error:', err); }
    );
  }

  function addAgriculturalComponents(robot, ud) {
    // Water Tank (Integrated into rear body)
    const tankGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 32);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x4facfe, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.8 });
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(0, 0.4, -0.75);
    tank.castShadow = true;
    robot.add(tank);
    ud.tank = tank;
    ud.origPos['tank'] = tank.position.clone();
    
    // Solar Panel (Mounted flat on top chassis)
    const solarGeo = new THREE.BoxGeometry(0.8, 0.02, 0.5);
    const solarMat = new THREE.MeshStandardMaterial({ color: 0x1E3A5F, roughness: 0.4, metalness: 0.8 });
    const solar = new THREE.Mesh(solarGeo, solarMat);
    solar.position.set(0, 0.98, -0.1);
    solar.castShadow = true;
    robot.add(solar);
    ud.solar = solar;
    ud.origPos['solar'] = solar.position.clone();

    // Soil Sensor & Nozzle (Front probing mechanism)
    const sensorGroup = new THREE.Group();
    const probeGeo = new THREE.CylinderGeometry(0.015, 0.005, 0.3, 16);
    const probeMat = new THREE.MeshStandardMaterial({ color: 0xF4A261, roughness: 0.6, metalness: 0.5 });
    const probe = new THREE.Mesh(probeGeo, probeMat);
    const mountGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const mountMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const mount = new THREE.Mesh(mountGeo, mountMat);
    probe.position.y = -0.15;
    sensorGroup.add(mount);
    sensorGroup.add(probe);
    sensorGroup.position.set(0.25, 0.3, 0.7);
    robot.add(sensorGroup);
    ud.sensor = sensorGroup;
    ud.origPos['sensor'] = sensorGroup.position.clone();

    // ESP32 Brain (Embedded inside body housing)
    const espGeo = new THREE.BoxGeometry(0.15, 0.05, 0.2);
    const espMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.2 });
    const esp = new THREE.Mesh(espGeo, espMat);
    esp.position.set(-0.15, 0.6, 0.1);
    
    const ledGeo = new THREE.BoxGeometry(0.02, 0.02, 0.02);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x00D4AA });
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0, 0.03, 0.08);
    esp.add(led);
    
    robot.add(esp);
    ud.esp = esp;
    ud.origPos['esp'] = esp.position.clone();
  }

  function buildVegetation() {
    const cGeo = new THREE.ConeGeometry(0.08, 0.35, 6);
    vegMat1 = new THREE.MeshStandardMaterial({ color: 0x2D6A4F });
    const count = 350, inst = new THREE.InstancedMesh(cGeo, vegMat1, count);
    const d = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      let x = (Math.random() - 0.5) * 20, z = (Math.random() - 0.5) * 20;
      if (Math.sqrt(x * x + z * z) < 2) { x += 3 }
      d.position.set(x, 0.17, z); d.scale.setScalar(0.6 + Math.random() * 0.8); d.rotation.y = Math.random() * Math.PI * 2; d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    }
    inst.castShadow = true; scene.add(inst);

    vegMat2 = new THREE.MeshStandardMaterial({ color: 0x1A472A });
    const t = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.6, 5), vegMat2, 80);
    for (let i = 0; i < 80; i++) {
      d.position.set((Math.random() - 0.5) * 18, 0.3, (Math.random() - 0.5) * 18);
      d.scale.setScalar(0.5 + Math.random()); d.rotation.y = Math.random() * Math.PI * 2; d.updateMatrix();
      t.setMatrixAt(i, d.matrix);
    }
    scene.add(t);
  }

  function buildParticles() {
    const n = 3000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const cW = new THREE.Color(0xE8EDF2), cC = new THREE.Color(0x00D4AA), cG = new THREE.Color(0xF4A261);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20; pos[i * 3 + 1] = Math.random() * 8; pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
      const r = Math.random(), c = r < 0.8 ? cW : r < 0.95 ? cC : cG;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    particleSystem = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.025, sizeAttenuation: true, transparent: true, opacity: 0.7, vertexColors: true, depthWrite: false }));
    scene.add(particleSystem);
  }

  function buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uTime: { value: 0 }, colorTop: { value: new THREE.Color(0x0D1B2A) }, colorBottom: { value: new THREE.Color(0x1A472A) } },
      vertexShader: `varying vec3 vWP;void main(){vec4 w=modelMatrix*vec4(position,1.0);vWP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `uniform vec3 colorTop;uniform vec3 colorBottom;uniform float uTime;varying vec3 vWP;void main(){float h=normalize(vWP).y;float t=smoothstep(-0.2,0.8,h);vec3 c=mix(colorBottom,colorTop,t);float s=sin(vWP.x*0.3+uTime*0.2)*sin(vWP.z*0.3+uTime*0.15)*0.04;c+=vec3(0.0,s,s*0.6);gl_FragColor=vec4(c,1.0);}`
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 32), mat));
    scene.userData.skyMat = mat;
  }

  // === SCROLL SYSTEM ===
  let scrollProgress = 0;

  // Phase 0 (video) occupies 0 → 0.22 of scroll. Phases 1-7 (3D) occupy 0.22 → 1.0.
  // All original phase values are rescaled into the 0.22–1.0 range.
  const VIDEO_END = 0.22;       // scrollProgress where video zone ends
  const CROSSFADE_START = 0.17; // video starts fading out
  const CROSSFADE_END = 0.23;   // canvas fully visible

  const phases = [
    { start: 0.22, end: 0.31, panel: 'panel-intro' },
    { start: 0.31, end: 0.39, panel: 'panel-zoom' },
    { start: 0.39, end: 0.61, panel: 'panel-specs' },
    { start: 0.61, end: 0.70, panel: 'panel-features' },
    { start: 0.70, end: 0.79, panel: 'panel-mission' },
    { start: 0.79, end: 0.89, panel: 'panel-impact' },
    { start: 0.89, end: 1.0,  panel: 'panel-stats' },
  ];

  function lerp(a, b, t) { return a + (b - a) * t }
  function mapRange(v, min, max) { return Math.max(0, Math.min(1, (v - min) / (max - min))) }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : (1 - Math.pow(-2 * t + 2, 2) / 2) }

  // === PHASE 0: AUTONOMOUS BACKGROUND VIDEO ===
  // Video plays independently via autoplay/loop HTML attributes.
  // No scroll coupling — maximum visual quality and fluidity.

  function initScroll() {
    const journey = document.getElementById('hero-journey');
    const videoWrap = document.getElementById('hero-video-wrap');
    const canvas = document.getElementById('hero-canvas');

    function onScroll() {
      const rect = journey.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      scrollProgress = Math.max(0, Math.min(1, -rect.top / total));

      // --- Phase 0: Video / Canvas crossfade ---
      if (scrollProgress <= CROSSFADE_START) {
        // Full video, no canvas
        videoWrap.style.opacity = 1;
        canvas.style.opacity = 0;
      } else if (scrollProgress <= CROSSFADE_END) {
        // Crossfade zone
        const t = easeInOut(mapRange(scrollProgress, CROSSFADE_START, CROSSFADE_END));
        videoWrap.style.opacity = 1 - t;
        canvas.style.opacity = t;
      } else if (scrollProgress < 1) {
        // Video hidden, Canvas fades OUT at the very end (from 0.95 to 1.0) to reveal Dashboard smoothly
        videoWrap.style.opacity = 0;
        let fadeOut = 1 - mapRange(scrollProgress, 0.95, 1.0);
        canvas.style.opacity = fadeOut;
      } else {
        // End of hero journey, completely transitioned to dashboard
        videoWrap.style.opacity = 0;
        canvas.style.opacity = 0;
      }

      updatePanels();
      updateCamera();
      updateRobotExplode();
      updateTerrainMorph();
      updateImpactBar();
      updateStats();
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function updatePanels() {
    phases.forEach((ph, pi) => {
      const el = document.getElementById(ph.panel); if (!el) return;

      let fadeIn, fadeOut;
      if (pi === 0) {
        // panel-intro: visible from page load (video phase) through its 3D range
        fadeIn = 1; // always faded in — animateHero() handles initial reveal
        fadeOut = 1 - mapRange(scrollProgress, ph.end - 0.04, ph.end);
      } else {
        fadeIn = mapRange(scrollProgress, ph.start - 0.02, ph.start + 0.04);
        fadeOut = 1 - mapRange(scrollProgress, ph.end - 0.04, ph.end);
      }
      const opacity = Math.max(0, Math.min(1, Math.min(fadeIn, fadeOut)));
      el.style.opacity = opacity;
      el.classList.toggle('active', opacity > 0.05);

      // Subtle parallax: intro panel drifts up gently as user scrolls
      if (pi === 0 && scrollProgress < 0.35) {
        const drift = scrollProgress * -120; // gentle upward motion
        const scale = 1 - scrollProgress * 0.08; // slight scale-down
        el.style.transform = `translateY(${drift}px) scale(${scale})`;
      }
    });
    // Scroll indicator fade — show during video phase, fade as user scrolls
    const si = document.getElementById('scroll-indicator');
    if (si) si.style.opacity = scrollProgress < 0.03 ? 1 : Math.max(0, 1 - mapRange(scrollProgress, 0.03, 0.12) * 4);
  }

  function updateCamera() {
    // Determine which two camera positions to interpolate
    let idx = 0;
    for (let i = 0; i < phases.length; i++) {
      if (scrollProgress >= phases[i].start) idx = i;
    }
    const ph = phases[idx];
    const t = easeInOut(mapRange(scrollProgress, ph.start, ph.end));
    const nextIdx = Math.min(idx + 1, camPositions.length - 1);
    const a = camPositions[idx], b = camPositions[nextIdx];
    currentCamPos.px = lerp(a.p[0], b.p[0], t);
    currentCamPos.py = lerp(a.p[1], b.p[1], t);
    currentCamPos.pz = lerp(a.p[2], b.p[2], t);
    currentCamPos.tx = lerp(a.t[0], b.t[0], t);
    currentCamPos.ty = lerp(a.t[1], b.t[1], t);
    currentCamPos.tz = lerp(a.t[2], b.t[2], t);

    // Cinematic Orbit Dolly effect during exploded view hold phase
    if (scrollProgress > 0.49 && scrollProgress <= 0.57) {
      const orbitT = mapRange(scrollProgress, 0.49, 0.57);
      const angle = orbitT * 0.5; // Orbit amount
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      
      const newX = currentCamPos.px * cosA - currentCamPos.pz * sinA;
      const newZ = currentCamPos.px * sinA + currentCamPos.pz * cosA;
      currentCamPos.px = newX;
      currentCamPos.pz = newZ;
      currentCamPos.py += Math.sin(orbitT * Math.PI) * 0.4; // slight vertical arc
    }
  }

  function updateRobotExplode() {
    if (!modelLoaded) return;
    
    // Calculate staggered explode amounts
    let expWheels = 0, expArms = 0, expTop = 0;

    // Explode Phase (shifted for video zone)
    if (scrollProgress >= 0.39 && scrollProgress < 0.49) {
      expWheels = easeInOut(mapRange(scrollProgress, 0.39, 0.44));
      expArms = easeInOut(mapRange(scrollProgress, 0.41, 0.46));
      expTop = easeInOut(mapRange(scrollProgress, 0.43, 0.49));
    } 
    // Hold Phase
    else if (scrollProgress >= 0.49 && scrollProgress <= 0.56) {
      expWheels = expArms = expTop = 1;
    } 
    // Reassemble Phase
    else if (scrollProgress > 0.56 && scrollProgress <= 0.63) {
      expTop = 1 - easeInOut(mapRange(scrollProgress, 0.56, 0.60));
      expArms = 1 - easeInOut(mapRange(scrollProgress, 0.58, 0.62));
      expWheels = 1 - easeInOut(mapRange(scrollProgress, 0.59, 0.63));
    }

    explodeAmount = Math.max(expWheels, expArms, expTop);

    const ud = robotGroup.userData;
    const time = Date.now() * 0.001;

    // Anti-gravity floating effect based on explode amount
    const floatY = Math.sin(time * 2) * 0.04;
    const floatX = Math.cos(time * 1.5) * 0.02;

    // 1. Wheels (Expand Laterally X)
    ud.wheels.forEach((w, i) => {
      const orig = ud.origPos[w.name];
      if (!orig) return;
      const dirX = Math.sign(orig.x) || 1;
      const fX = floatX * expWheels * (i % 2 === 0 ? 1 : -1);
      w.position.x = orig.x + dirX * 0.8 * expWheels + fX;
    });

    // 2. Front Arms (Extend Forward & Out)
    ud.frontarms.forEach((fa, i) => {
      const orig = ud.origPos[fa.name];
      if (!orig) return;
      const dirX = Math.sign(orig.x) || 1;
      const dirZ = Math.sign(orig.z) || 1;
      const fY = floatY * expArms * (i % 2 === 0 ? 1 : -1);
      fa.position.x = orig.x + dirX * 0.4 * expArms;
      fa.position.z = orig.z + dirZ * 0.6 * expArms;
      fa.position.y = orig.y + fY;
    });

    // 3. Tank (Rearwards)
    if (ud.tank && ud.origPos['tank']) {
      ud.tank.position.z = ud.origPos['tank'].z - 0.7 * expArms;
      ud.tank.position.y = ud.origPos['tank'].y + floatY * expArms;
    }

    // 4. Sensor & Nozzle (Forward & Downwards)
    if (ud.sensor && ud.origPos['sensor']) {
      ud.sensor.position.z = ud.origPos['sensor'].z + 0.5 * expArms;
      ud.sensor.position.y = ud.origPos['sensor'].y - 0.2 * expArms - floatY * expArms;
    }

    // 5. Top Components (Lift Vertically)
    if (ud.solar && ud.origPos['solar']) {
      ud.solar.position.y = ud.origPos['solar'].y + 1.0 * expTop + floatY * expTop;
    }
    if (ud.robotArm && ud.origPos[ud.robotArm.name]) {
      ud.robotArm.position.y = ud.origPos[ud.robotArm.name].y + 1.4 * expTop + floatY * expTop;
    }
    if (ud.robotComponent && ud.origPos[ud.robotComponent.name]) {
      ud.robotComponent.position.y = ud.origPos[ud.robotComponent.name].y + 1.8 * expTop + floatY * expTop;
    }

    // ESP32 remains in place, revealed when top components lift.

    // HTML Spec Labels Animation (Linked to general explodeAmount)
    if (scrollProgress > 0.39 && scrollProgress < 0.63) {
      document.querySelectorAll('.spec-label').forEach((el, i) => {
        el.style.opacity = explodeAmount;
        const isRight = el.classList.contains('sl-sensors') || el.classList.contains('sl-antenna');
        el.style.transform = `translateX(${isRight ? (1 - explodeAmount) * 30 : (explodeAmount - 1) * 30}px)`;
      });
    } else {
      document.querySelectorAll('.spec-label').forEach(el => el.style.opacity = 0);
    }
  }

  function updateTerrainMorph() {
    const t = mapRange(scrollProgress, 0.79, 0.87);
    terrainGreen = easeInOut(t);
    if (terrainMesh) {
      const brown = new THREE.Color(0x5C4033), green = new THREE.Color(0x3a7d44);
      terrainMesh.material.color.copy(brown).lerp(green, terrainGreen);
    }
    if (vegMat1) {
      const dark = new THREE.Color(0x2D6A4F), bright = new THREE.Color(0x4CAF50);
      vegMat1.color.copy(dark).lerp(bright, terrainGreen);
    }
    if (vegMat2) {
      vegMat2.color.copy(new THREE.Color(0x1A472A)).lerp(new THREE.Color(0x66BB6A), terrainGreen);
    }
  }

  function updateImpactBar() {
    const bar = document.getElementById('impact-bar-fill');
    if (bar) {
      const t = mapRange(scrollProgress, 0.79, 0.87);
      bar.style.width = (easeInOut(t) * 100) + '%';
    }
  }

  // Stats counter
  let statsAnimated = false;
  function updateStats() {
    if (statsAnimated) return;
    if (scrollProgress > 0.91) {
      statsAnimated = true;
      document.querySelectorAll('.stat-num').forEach(el => {
        const target = parseInt(el.dataset.target), suffix = el.dataset.suffix || '';
        gsap.to({ v: 0 }, { v: target, duration: 2, ease: 'power2.out', onUpdate: function () { el.textContent = Math.round(this.targets()[0].v) + suffix } });
      });
    }
  }

  // Feature cards animation
  let featuresAnimated = false;
  function checkFeatureCards() {
    if (featuresAnimated) return;
    if (scrollProgress > 0.61 && scrollProgress < 0.70) {
      featuresAnimated = true;
      gsap.to('.fc-left', { opacity: 1, x: 0, duration: 0.8, stagger: 0.15, ease: 'power3.out' });
      gsap.to('.fc-right', { opacity: 1, x: 0, duration: 0.8, stagger: 0.15, ease: 'power3.out', delay: 0.1 });
    }
  }

  // === RENDER LOOP ===
  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    if (scene.userData.skyMat) scene.userData.skyMat.uniforms.uTime.value = t;

    if (robotGroup && modelLoaded) {
      const ud = robotGroup.userData;
      // Gentle float bob above resting position
      robotGroup.position.y = ud.baseY + Math.sin(t * 0.6) * 0.04;
      // Slow idle sway
      robotGroup.rotation.y = ud.baseRotY + Math.sin(t * 0.2) * 0.12;
      // Wheel spin around local Z axis
      ud.wheels.forEach(w => { w.traverse(c => { if (c.isMesh) c.rotation.z += 0.05; }); });
    }
    // Do NOT rotate scene — it moves terrain & robot off-screen

    if (particleSystem) {
      const pos = particleSystem.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { let y = pos.getY(i); y += 0.002 + Math.sin(t + i) * 0.001; if (y > 8) y = 0; pos.setY(i, y) }
      pos.needsUpdate = true;
    }

    // Camera: base position from scroll + mouse parallax
    const mx = mouseX * 0.4 * (1 - scrollProgress * 0.5);
    const my = mouseY * 0.25 * (1 - scrollProgress * 0.5);
    camera.position.set(currentCamPos.px + mx, currentCamPos.py + my, currentCamPos.pz);
    camera.lookAt(currentCamPos.tx, currentCamPos.ty, currentCamPos.tz);

    checkFeatureCards();
    renderer.render(scene, camera);
  }

  // === HERO TEXT ANIMATIONS ===
  function animateHero() {
    const title = document.getElementById('hero-title');
    const text = title.textContent; title.textContent = '';
    [...text].forEach(c => { const s = document.createElement('span'); s.className = 'char'; s.textContent = c; title.appendChild(s) });
    const tl = gsap.timeline({ delay: 0.3 });
    tl.to('.hero-title .char', { opacity: 1, y: 0, rotateX: 0, duration: 0.6, stagger: 0.05, ease: 'back.out(1.7)' });
    tl.to('#hero-sub-fr', { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=.3');
    tl.to('#hero-sub-ar', { opacity: 0.7, y: 0, duration: 0.8, ease: 'power3.out' }, '-=.6');
    tl.to('.hero-status', { opacity: 1, duration: 0.5, ease: 'power2.out' }, '-=.4');
    tl.to('.hero-cta', { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, '-=.3');
    tl.to('.scroll-indicator', { opacity: 1, duration: 0.6, ease: 'power2.out' }, '-=.2');
  }

  // === NAVBAR ===
  function initNav() {
    const nav = document.getElementById('main-nav'), ham = document.getElementById('hamburger'), links = document.getElementById('nav-links'), prog = document.getElementById('scroll-progress');
    nav.classList.add('visible');
    window.addEventListener('scroll', () => {
      const s = window.scrollY, d = document.documentElement.scrollHeight - window.innerHeight;
      prog.style.width = (s / d * 100) + '%';
      nav.classList.toggle('scrolled', s > 80);
    });
    ham.addEventListener('click', () => { ham.classList.toggle('open'); links.classList.toggle('open') });
    links.querySelectorAll('.nav-link').forEach(l => l.addEventListener('click', () => { ham.classList.remove('open'); links.classList.remove('open') }));
  }

  // === DASHBOARD LOGIC ===
  let dashboardInitialized = false;
  const sensorHistory = {
    temp: Array(30).fill(0),
    air: Array(30).fill(0),
    soil: Array(30).fill(0),
    dist: Array(30).fill(100),
    status: Array(30).fill(0)
  };

  // Zone actuellement affichée dans le Dashboard
  let currentZone = 'A';

  function initDashboard() {
    if (dashboardInitialized) return;
    dashboardInitialized = true;

    gsap.registerPlugin(ScrollTrigger);
    gsap.to('.glass-card', {
      scrollTrigger: { trigger: '#dashboard', start: 'top 75%' },
      y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: 'power3.out'
    });

    // ══ WebSocket : écouter les nouvelles mesures envoyées par l'ESP32 ══
    if (window.io) {
      const socketUrl = (window.location.port === '5500' || window.location.port === '5501')
        ? 'http://localhost:3000'
        : undefined; // undefined = même origine (http://localhost:3000/...)
      const token = localStorage.getItem('soussrover_jwt');
      const socket = window.io(socketUrl, { auth: { token } });
      socket.on('connect', () => {
        console.log('🔌 WebSocket connecté !', socket.id);
        if (window.addAlert) window.addAlert('WebSocket connecté — temps réel actif.', 'info');
      });
      socket.on('nouvelle_mesure', (data) => {
        // Une nouvelle mesure vient d'arriver depuis l'ESP32 — rafraîchir le dashboard
        fetchBackendData();
        updateFastSensors();
        if (data.zone === currentZone && data.robot_status === 'obstacle' && window.addAlert) {
          window.addAlert(`🚧 Obstacle détecté (${Math.round(data.distance_obstacle)} cm) — Zone ${data.zone}`, 'warn');
        }
      });
      socket.on('disconnect', () => {
        console.warn('🔌 WebSocket déconnecté. Bascule sur polling de secours...');
        setInterval(fetchBackendData, 5000);
      });
    } else {
      // Fallback si socket.io-client n'est pas chargé
      setInterval(fetchBackendData, 5000);
    }

    // ══ Sélecteur de zone ══
    const zoneSelect = document.getElementById('zone-select');
    if (zoneSelect) {
      zoneSelect.addEventListener('change', (e) => {
        currentZone = e.target.value;
        fetchBackendData();
        prefetchSensorHistory();
        initChartsFromDB();
        updateAIEngine();   // Mettre à jour la prédiction IA pour la nouvelle zone
        if (window.addAlert) window.addAlert(`Zone affichée : Secteur ${currentZone}`, 'info');
      });
    }

    prefetchSensorHistory();
    setInterval(updateFastSensors, 1000);
    fetchBackendData();
    updateFastSensors();
    drawSparklines();
  }

  // Pre-populate sparkline history with last 30 real ESP32 measures from the selected zone
  async function prefetchSensorHistory() {
    try {
      const res = await fetch(API_BASE + '/api/donnees/zone/' + currentZone + '?limite=30');
      if (!res.ok) return;
      const { donnees } = await res.json();
      (donnees || []).slice().reverse().forEach(m => {
        pushHistory('temp', m.temperature_air);
        pushHistory('air',  m.humidite_air);
        pushHistory('soil', m.humidite_sol);
      });
    } catch (e) {}
  }

  async function fetchBackendData() {
    try {
      const res = await fetch(API_BASE + '/api/dashboard');
      if (!res.ok) return;
      const data = await res.json();
      window.lastDashboardData = data;
      
      if (data.zones && data.zones.length > 0) {
        // Utiliser la zone sélectionnée par l'utilisateur (sélecteur de zone)
        const z = data.zones.find(z => z.zone === currentZone) || data.zones[0];
        
        const temp = z.temperature_air;
        document.getElementById('val-temp').textContent = temp.toFixed(1);
        document.getElementById('ind-temp').style.height = mapRange(temp, 20, 45) * 100 + '%';
        pushHistory('temp', temp);

        const air = z.humidite_air;
        document.getElementById('val-air').textContent = Math.round(air);
        const drops = document.querySelectorAll('.air-drops .drop');
        drops.forEach((d, i) => {
          setTimeout(() => {
            d.classList.add('active');
            setTimeout(() => d.classList.remove('active'), 500);
          }, i * 200 + Math.random() * 500);
        });
        pushHistory('air', air);

        const soil = z.humidite_sol;
        document.getElementById('val-soil').textContent = Math.round(soil);
        const circle = document.getElementById('ind-soil');
        if (circle) circle.style.strokeDasharray = `${soil}, 100`;
        pushHistory('soil', soil);
      }

      if (data.meteo) {
        const p = data.meteo.probabilite_pluie;
        const owmTemp = data.meteo.temperature_prevue;
        document.getElementById('ind-weather').textContent = p > 0.5 ? '🌧️' : (p > 0.2 ? '⛅' : '☀️');
        document.getElementById('val-weather').textContent = data.meteo.description_meteo || (p > 0.5 ? 'Pluie Prévue' : 'Ensoleillé');
        const wtEl = document.getElementById('val-weather-temp');
        if (wtEl && owmTemp != null) wtEl.textContent = owmTemp.toFixed(1) + '°C · prévision OWM';
      }

      // Robot staleness banner
      if (data.robot_status) {
        const banner = document.getElementById('robot-staleness-banner');
        const msg    = document.getElementById('staleness-msg');
        if (banner && msg) {
          if (data.robot_status.is_stale) {
            const mins = data.robot_status.minutes_ago;
            const age  = mins == null ? 'jamais' : mins >= 60 ? Math.round(mins / 60) + 'h' : mins + ' min';
            const lastTs = data.robot_status.last_seen
              ? new Date(data.robot_status.last_seen).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
              : '—';
            msg.textContent = `Robot hors ligne · dernière mesure: ${lastTs} (il y a ${age})`;
            banner.style.display = 'flex';
          } else {
            banner.style.display = 'none';
          }
        }
      }

      // Update doughnut chart from real zone health statuts
      if (chartStatus && data.zones && data.zones.length > 0) {
        const statuts   = data.zones.map(z => z.statut);
        const normal    = statuts.filter(s => s === 'normal').length;
        const attention = statuts.filter(s => s === 'attention').length;
        const critique  = statuts.filter(s => s === 'critique').length;
        const total     = statuts.length || 1;
        chartStatus.data.datasets[0].data = [
          Math.round(normal    / total * 100),
          Math.round(critique  / total * 100),
          Math.round(attention / total * 100)
        ];
        chartStatus.update();
      }

      if (data.alertes_actives) {
        data.alertes_actives.forEach(al => {
           const alertId = `backend-alert-${al.id}`;
           if (!window.seenAlerts) window.seenAlerts = new Set();
           if (!window.seenAlerts.has(alertId)) {
             window.seenAlerts.add(alertId);
             let type = 'info';
             if (al.niveau === 'rouge') type = 'crit';
             if (al.niveau === 'orange') type = 'warn';
             window.addAlert(al.message, type);
           }
        });
      }
    } catch (err) {
      console.error('Erreur API Backend:', err);
    }
  }

  function updateFastSensors() {
    let dist = 100;
    let r_status = "moving";
    let stVal = 2;

    if (window.lastDashboardData && window.lastDashboardData.zones && window.lastDashboardData.zones.length > 0) {
      const z = window.lastDashboardData.zones[0];
      if (z.distance_obstacle !== undefined && z.distance_obstacle !== null) dist = z.distance_obstacle;
      if (z.robot_status) r_status = z.robot_status;
    }

    document.getElementById('val-dist').textContent = Math.round(dist);
    pushHistory('dist', dist);
    
    const waves = document.querySelectorAll('.wave');
    waves.forEach(w => {
      w.classList.remove('ping');
      void w.offsetWidth;
      w.classList.add('ping');
    });

    const statusBadge = document.getElementById('val-status');
    if (r_status === "stopped") {
      statusBadge.textContent = 'STOP';
      statusBadge.className = 'status-badge stop';
      stVal = 0;
    } else if (r_status === "obstacle") {
      statusBadge.textContent = 'OBSTACLE';
      statusBadge.className = 'status-badge';
      statusBadge.style.color = 'var(--solar-gold)';
      statusBadge.style.borderColor = 'var(--solar-gold)';
      stVal = 1;
      
      // Ajouter à l'historique des obstacles si c'est nouveau
      const obsContainer = document.getElementById('obstacles-feed');
      if (obsContainer) {
        const timeNow = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const lastObstacle = obsContainer.firstElementChild;
        // On évite de spammer le même obstacle s'il vient d'être détecté
        if (!lastObstacle || lastObstacle.textContent.indexOf(timeNow.slice(0, 5)) === -1) {
          const item = document.createElement('div');
          item.className = 'alert-item alert-warn';
          item.innerHTML = `<span class="alert-time">${timeNow}</span> <span class="alert-icon">🛑</span> <span class="alert-msg">Obstacle détecté à ${Math.round(dist)} cm</span>`;
          obsContainer.prepend(item);
          // Garder seulement les 5 derniers
          if (obsContainer.children.length > 5) obsContainer.removeChild(obsContainer.lastChild);
          // Retirer le message "En attente..." s'il y est
          if (obsContainer.children.length > 1 && obsContainer.lastChild.textContent.includes("En attente")) {
            obsContainer.removeChild(obsContainer.lastChild);
          }
        }
      }

    } else {
      statusBadge.textContent = 'EN AVANT';
      statusBadge.className = 'status-badge';
      statusBadge.style.color = 'var(--cyber-cyan)';
      statusBadge.style.borderColor = 'var(--cyber-cyan)';
      stVal = 2;
    }
    pushHistory('status', stVal);

    let r_mode = "AUTO";
    let batLvl = null;
    if (window.lastDashboardData && window.lastDashboardData.zones && window.lastDashboardData.zones.length > 0) {
      const z = window.lastDashboardData.zones[0];
      if (z.mode) r_mode = z.mode;
      if (z.battery_level !== undefined && z.battery_level !== null) batLvl = z.battery_level;
    }
    const modeBadge = document.getElementById('val-mode');
    if (modeBadge) {
      modeBadge.textContent = r_mode;
      if (r_mode === 'WIFI') {
        modeBadge.style.color = 'var(--cyber-cyan)';
        modeBadge.style.borderColor = 'rgba(0, 255, 255, 0.3)';
        modeBadge.style.background = 'rgba(0, 255, 255, 0.1)';
      } else if (r_mode === 'BT') {
        modeBadge.style.color = '#4facfe';
        modeBadge.style.borderColor = 'rgba(79, 172, 254, 0.3)';
        modeBadge.style.background = 'rgba(79, 172, 254, 0.1)';
      } else {
        modeBadge.style.color = 'var(--solar-gold)';
        modeBadge.style.borderColor = 'rgba(255, 215, 0, 0.3)';
        modeBadge.style.background = 'rgba(255, 215, 0, 0.1)';
      }
      
      const selectMode = document.getElementById('select-mode');
      if (selectMode && selectMode.value !== r_mode) {
        selectMode.value = r_mode;
      }
      
      const dpadWrap = document.querySelector('.dpad-wrap');
      if (dpadWrap) {
        if (r_mode === 'AUTO') {
          dpadWrap.style.opacity = '0.4';
          dpadWrap.style.filter = 'grayscale(100%)';
        } else {
          dpadWrap.style.opacity = '1';
          dpadWrap.style.filter = 'none';
        }
      }
    }

    const batBadge = document.getElementById('battery-label');
    const batNav = document.getElementById('robot-battery-nav');
    if (batBadge && batNav) {
      if (batLvl !== null) {
        batBadge.textContent = Math.round(batLvl) + '%';
        if (batLvl > 50) {
          batNav.style.color = '#00D4AA';
          batNav.style.borderColor = 'rgba(0, 212, 170, 0.3)';
          batNav.style.background = 'rgba(0, 212, 170, 0.1)';
        } else if (batLvl > 20) {
          batNav.style.color = 'var(--solar-gold)';
          batNav.style.borderColor = 'rgba(255, 215, 0, 0.3)';
          batNav.style.background = 'rgba(255, 215, 0, 0.1)';
        } else {
          batNav.style.color = 'var(--alert-red)';
          batNav.style.borderColor = 'rgba(255, 50, 50, 0.3)';
          batNav.style.background = 'rgba(255, 50, 50, 0.1)';
        }
      } else {
        batBadge.textContent = '--%';
      }
    }
  }

  function pushHistory(key, val) {
    sensorHistory[key].push(val);
    sensorHistory[key].shift();
  }

  function drawSparklines() {
    requestAnimationFrame(drawSparklines);
    const canvasIds = ['spark-temp', 'spark-air', 'spark-soil', 'spark-dist', 'spark-status'];
    const keys = ['temp', 'air', 'soil', 'dist', 'status'];
    const mins = [20, 20, 0, 0, -0.5];
    const maxs = [45, 80, 100, 450, 2.5];

    canvasIds.forEach((id, i) => {
      const cvs = document.getElementById(id);
      if (!cvs) return;
      const ctx = cvs.getContext('2d');
      const w = cvs.width, h = cvs.height;
      const data = sensorHistory[keys[i]];
      const min = mins[i], max = maxs[i];
      
      ctx.clearRect(0, 0, w, h);
      
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(0, 212, 170, 0.3)');
      grad.addColorStop(1, 'rgba(0, 212, 170, 0.0)');
      
      ctx.beginPath();
      ctx.moveTo(0, h);
      const step = w / (data.length - 1);
      data.forEach((val, j) => {
        const y = h - Math.max(0, Math.min(1, (val - min) / (max - min))) * h * 0.8 - 2;
        ctx.lineTo(j * step, y);
      });
      ctx.lineTo(w, h);
      ctx.fillStyle = grad;
      ctx.fill();
      
      ctx.beginPath();
      data.forEach((val, j) => {
        const y = h - Math.max(0, Math.min(1, (val - min) / (max - min))) * h * 0.8 - 2;
        if (j === 0) ctx.moveTo(j * step, y);
        else ctx.lineTo(j * step, y);
      });
      ctx.strokeStyle = '#00D4AA';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
    });
  }

  // === ANALYTICS LOGIC ===
  let analyticsInitialized = false;
  let chartSoil, chartTemp, chartStatus, chartAir;
  let heatmapData = [];

  function initAnalytics() {
    if (analyticsInitialized || typeof Chart === 'undefined') return;
    analyticsInitialized = true;

    Chart.defaults.color = 'rgba(232,237,242,0.6)';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';

    const ctxSoil = document.getElementById('chart-soil').getContext('2d');
    chartSoil = new Chart(ctxSoil, {
      type: 'line',
      data: {
        labels: Array.from({length: 24}, (_, i) => `${i}h`),
        datasets: [{
          label: 'Humidité Sol (%)',
          data: Array(24).fill(null),
          borderColor: '#00D4AA',
          backgroundColor: 'rgba(0, 212, 170, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const ctxTemp = document.getElementById('chart-temp').getContext('2d');
    chartTemp = new Chart(ctxTemp, {
      type: 'bar',
      data: {
        labels: Array.from({length: 24}, (_, i) => `${i}h`),
        datasets: [{
          label: 'Température (°C)',
          data: Array(24).fill(null),
          backgroundColor: 'rgba(244,162,97,0.7)',
          borderRadius: 4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const ctxStatus = document.getElementById('chart-status').getContext('2d');
    chartStatus = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: ['Normal', 'Critique', 'Attention'],
        datasets: [{
          data: [0, 0, 0],
          backgroundColor: ['#00D4AA', '#FF4757', '#F4A261'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: '#E8EDF2' } } } }
    });

    const ctxAir = document.getElementById('chart-air').getContext('2d');
    chartAir = new Chart(ctxAir, {
      type: 'line',
      data: {
        labels: Array.from({length: 24}, (_, i) => `${i}h`),
        datasets: [{
          label: 'Humidité Air (%)',
          data: Array(24).fill(null),
          borderColor: '#A78BFA',
          backgroundColor: 'rgba(167,139,250,0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { min: 0, max: 100 } }
      }
    });

    initHeatmap();

    gsap.to('.chart-card', {
      scrollTrigger: { trigger: '#analytics', start: 'top 75%' },
      y: 0, opacity: 1, duration: 0.8, stagger: 0.15, ease: 'power3.out'
    });

    setInterval(updateAnalytics, 3000);
    initChartsFromDB();
  }

  // Populate charts with real ESP32 data from the selected zone (last 24 measures)
  async function initChartsFromDB() {
    try {
      const res = await fetch(API_BASE + '/api/donnees/zone/' + currentZone + '?limite=24');
      if (!res.ok) return;
      const { donnees } = await res.json();
      const measures = (donnees || []).slice().reverse();
      const labels = measures.map(m => {
        const d = new Date(m.timestamp_serveur);
        return d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0');
      });
      if (chartSoil) {
        chartSoil.data.labels = labels;
        chartSoil.data.datasets[0].data = measures.map(m => m.humidite_sol);
        chartSoil.update();
      }
      if (chartTemp) {
        chartTemp.data.labels = labels;
        chartTemp.data.datasets[0].data = measures.map(m => m.temperature_air);
        chartTemp.update();
      }
      if (chartAir) {
        chartAir.data.labels = labels;
        chartAir.data.datasets[0].data = measures.map(m => m.humidite_air);
        chartAir.update();
      }
      refreshHeatmapFromZones();
    } catch (e) {}
  }

  function initHeatmap() {
    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';
    heatmapData = [];
    for (let i = 0; i < 80; i++) {
      const cell = document.createElement('div');
      cell.className = 'hm-cell';
      heatmapData.push(0.5);
      updateHeatmapCell(cell, 0.5);
      grid.appendChild(cell);
    }
    refreshHeatmapFromZones();
  }

  // Map real zone soil moisture to heatmap cells:
  //   Zone A (Parcelle Nord)  → cells 0–29
  //   Zone B (Parcelle Sud)   → cells 30–59
  //   Zone C (Parcelle Est)   → cells 60–79
  function refreshHeatmapFromZones() {
    const data = window.lastDashboardData;
    if (!data || !data.zones || !data.zones.length) return;
    const grid = document.getElementById('heatmap-grid');
    if (!grid) return;
    const cells = grid.children;
    const zoneMap = [
      { start: 0,  end: 30, code: 'A' },
      { start: 30, end: 60, code: 'B' },
      { start: 60, end: 80, code: 'C' }
    ];
    zoneMap.forEach(({ start, end, code }) => {
      const zone = data.zones.find(z => z.zone === code);
      if (!zone) return;
      const baseVal = Math.max(0, Math.min(1, zone.humidite_sol / 100));
      for (let i = start; i < end; i++) {
        const val = Math.max(0, Math.min(1, baseVal));
        heatmapData[i] = val;
        if (cells[i]) updateHeatmapCell(cells[i], val);
      }
    });
  }

  function updateHeatmapCell(cell, val) {
    if (val < 0.3) {
      cell.style.background = `rgba(244, 162, 97, ${0.4 + val})`; // Gold (Sec)
    } else if (val < 0.7) {
      cell.style.background = `rgba(45, 106, 79, ${0.2 + val})`; // Green (Normal)
    } else {
      cell.style.background = `rgba(0, 212, 170, ${val})`; // Cyan (Humide)
    }
  }

  function updateAnalytics() {
    if (!analyticsInitialized) return;

    const latestSoil = sensorHistory.soil[sensorHistory.soil.length - 1];
    if (latestSoil) {
      chartSoil.data.datasets[0].data.shift();
      chartSoil.data.datasets[0].data.push(latestSoil);
      chartSoil.update();
    }

    const latestTemp = sensorHistory.temp[sensorHistory.temp.length - 1];
    if (latestTemp && chartTemp) {
      chartTemp.data.datasets[0].data.shift();
      chartTemp.data.datasets[0].data.push(latestTemp);
      chartTemp.update();
    }

    const latestAir = sensorHistory.air[sensorHistory.air.length - 1];
    if (latestAir && chartAir) {
      chartAir.data.datasets[0].data.shift();
      chartAir.data.datasets[0].data.push(latestAir);
      chartAir.update();
    }

    refreshHeatmapFromZones();
  }

  // === AI ENGINE LOGIC ===
  let aiInitialized = false;

  function initAIEngine() {
    if (aiInitialized) return;
    aiInitialized = true;

    gsap.to('.ai-container', {
      scrollTrigger: { trigger: '#ai-engine', start: 'top 75%' },
      y: 0, opacity: 1, duration: 1, ease: 'power3.out'
    });

    setInterval(updateAIEngine, 10000); // Update from API every 10s
    updateAIEngine();
  }

  async function updateAIEngine() {
    if (!aiInitialized) return;

    try {
      // Utilise la zone sélectionnée dans le sélecteur — plus jamais hardcodé
      const res = await fetch(API_BASE + '/api/prediction/' + currentZone);
      if (!res.ok) return;
      const data = await res.json();

      if (data.erreur) {
        const badge = document.getElementById('ai-final-decision');
        if (badge) { badge.textContent = data.erreur; badge.className = 'ai-output-badge'; }
        return;
      }

      // Afficher la zone active dans l'interface
      const zoneLabel = document.getElementById('fc-val-in');
      const soil = data.derniere_mesure.humidite_sol;
      const temp = data.derniere_mesure.temperature_air;
      const isRain = data.arrosage_bloque;

      // Update Input Node
      if (zoneLabel) zoneLabel.textContent = `Zone ${currentZone} — ${Math.round(soil)}% | ${temp.toFixed(1)}°C`;
      document.getElementById('fc-val-weather').textContent = isRain ? 'PLUIE' : 'CLAIR';

      // Reset Flowchart
      document.querySelectorAll('.fc-line-flow').forEach(el => { el.classList.remove('active'); el.style.stroke = ''; });
      document.querySelectorAll('.fc-node').forEach(el => { el.classList.remove('active', 'alert-node', 'rain-node'); });

      // Activate Base Nodes
      document.getElementById('node-input').classList.add('active');
      document.getElementById('flow-start').classList.add('active');
      document.getElementById('node-weather').classList.add('active');

      const badge = document.getElementById('ai-final-decision');

      if (isRain) {
        document.getElementById('flow-rain').classList.add('active');
        document.getElementById('flow-rain').style.stroke = '#4facfe';
        document.getElementById('node-rain-out').classList.add('active', 'rain-node');
        badge.textContent = "Pluie prévue — Pas d'arrosage";
        badge.className = 'ai-output-badge mode-rain';
      } else {
        document.getElementById('flow-norain').classList.add('active');
        document.getElementById('node-hum').classList.add('active');

        if (data.prediction.urgence === 'immédiat' || data.prediction.urgence === 'très urgent') {
          document.getElementById('flow-urgent').classList.add('active');
          document.getElementById('flow-urgent').style.stroke = 'var(--alert-red)';
          document.getElementById('node-urgent').classList.add('active', 'alert-node');
          badge.textContent = data.prediction.message;
          badge.className = 'ai-output-badge mode-urgent';
        } else {
          document.getElementById('flow-calc').classList.add('active');
          document.getElementById('node-calc').classList.add('active');
          
          document.getElementById('fc-val-calc').textContent = `${data.prediction.heuresRestantes}h`;
          
          badge.textContent = data.prediction.message;
          badge.className = 'ai-output-badge mode-normal';
        }
      }
    } catch (e) {
      console.error('Erreur API Prediction:', e);
    }
  }

  // === CONTROL LOGIC ===
  let controlInitialized = false;
  function initControl() {
    if (controlInitialized) return;
    controlInitialized = true;

    gsap.to('.control-grid', {
      scrollTrigger: { trigger: '#control', start: 'top 75%' },
      y: 0, opacity: 1, duration: 0.8, ease: 'power3.out'
    });

    initDPad();
    initActionButtons();
    initModeSelector();
  }

  function initDPad() {
    const cmdLast = document.getElementById('cmd-last');
    
    const cmds = [
      { id: 'btn-up', api: 'F', text: 'Marche Avant', color: 'var(--cyber-cyan)' },
      { id: 'btn-down', api: 'B', text: 'Marche Arrière', color: 'var(--cyber-cyan)' },
      { id: 'btn-left', api: 'L', text: 'Rotation Gauche', color: 'var(--cyber-cyan)' },
      { id: 'btn-right', api: 'R', text: 'Rotation Droite', color: 'var(--cyber-cyan)' },
      { id: 'btn-center-stop', api: 'S', text: 'Stop Manuel', color: 'var(--alert-red)' }
    ];

    cmds.forEach(cmd => {
      const btn = document.getElementById(cmd.id);
      if (btn) {
        btn.addEventListener('click', () => {
          const modeBadge = document.getElementById('val-mode');
          if (modeBadge && modeBadge.textContent === 'AUTO') {
            if (window.addAlert) window.addAlert("Pilotage manuel désactivé en mode AUTO. Passez en mode WIFI ou BT.", "warn");
            return;
          }

          fetch(API_BASE + '/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd.api })
          }).catch(console.error);
          
          if (cmdLast) {
            cmdLast.textContent = cmd.text;
            cmdLast.style.color = cmd.color;
          }
          gsap.fromTo(btn, { scale: 0.8 }, { scale: 1, duration: 0.3, ease: "back.out(2)" });
        });
      }
    });
  }

  function initActionButtons() {
    const cmdLast = document.getElementById('cmd-last');
    
    const cmds = [
      { id: 'btn-start', text: 'Démarrage Mission', color: 'var(--cyber-cyan)', type: 'info', msg: 'Mission démarrée manuellement.', api: 'F' },
      { id: 'btn-stop', text: "ARRÊT D'URGENCE", color: 'var(--alert-red)', type: 'crit', msg: "Arrêt d'urgence déclenché par l'opérateur.", api: 'STOP_ALL' },
      { id: 'btn-water', text: 'Irrigation Forcée', color: '#4facfe', type: 'info', msg: 'Irrigation manuelle forcée sur le secteur actuel.' },
      { id: 'btn-home', text: 'Retour Base', color: 'var(--solar-gold)', type: 'warn', msg: 'Ordre de retour à la station de charge émis.' }
    ];

    cmds.forEach(cmd => {
      const btn = document.getElementById(cmd.id);
      if (btn) {
        btn.addEventListener('click', () => {
          if (cmd.api) {
            fetch(API_BASE + '/api/command', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command: cmd.api })
            }).catch(console.error);
          }
          cmdLast.textContent = cmd.text;
          cmdLast.style.color = cmd.color;
          if (window.addAlert) window.addAlert(cmd.msg, cmd.type);
          gsap.fromTo(btn, { scale: 0.95 }, { scale: 1, duration: 0.3, ease: "back.out(2)" });
        });
      }
    });
  }

  function initModeSelector() {
    const selectMode = document.getElementById('select-mode');
    if (selectMode) {
      selectMode.addEventListener('change', (e) => {
        const uppercaseMode = e.target.value;
        fetch(API_BASE + '/api/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: uppercaseMode })
        }).then(res => res.json()).then(data => {
          if (data.succes && window.addAlert) {
            window.addAlert(`Mode robot défini sur ${uppercaseMode}`, 'info');
            // Update badge optimistically
            const modeBadge = document.getElementById('val-mode');
            if (modeBadge) {
              modeBadge.textContent = uppercaseMode;
              if (uppercaseMode === 'WIFI') {
                modeBadge.style.color = 'var(--cyber-cyan)';
                modeBadge.style.borderColor = 'rgba(0, 255, 255, 0.3)';
                modeBadge.style.background = 'rgba(0, 255, 255, 0.1)';
              } else if (uppercaseMode === 'BT') {
                modeBadge.style.color = '#4facfe';
                modeBadge.style.borderColor = 'rgba(79, 172, 254, 0.3)';
                modeBadge.style.background = 'rgba(79, 172, 254, 0.1)';
              } else {
                modeBadge.style.color = 'var(--solar-gold)';
                modeBadge.style.borderColor = 'rgba(255, 215, 0, 0.3)';
                modeBadge.style.background = 'rgba(255, 215, 0, 0.1)';
              }
            }
          }
        }).catch(console.error);
      });
    }
  }

  // === ALERTS LOGIC ===
  let alertsInitialized = false;
  
  function initAlerts() {
    if (alertsInitialized) return;
    alertsInitialized = true;

    gsap.to('.alerts-card', {
      scrollTrigger: { trigger: '#alerts', start: 'top 80%' },
      y: 0, opacity: 1, duration: 0.8, ease: 'power3.out'
    });

    const btnClear = document.getElementById('btn-clear-alerts');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        const feed = document.getElementById('alerts-feed');
        if (feed) feed.innerHTML = '';
      });
    }
  }

  window.addAlert = function(msg, type = 'info') {
    const feed = document.getElementById('alerts-feed');
    if (!feed) return;

    const icons = { info: 'ℹ️', warn: '⚠️', crit: '🚨' };
    const classes = { info: 'alert-info', warn: 'alert-warn', crit: 'alert-crit' };

    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    const item = document.createElement('div');
    item.className = `alert-item ${classes[type]}`;
    item.innerHTML = `
      <span class="alert-time">${time}</span>
      <span class="alert-icon">${icons[type]}</span>
      <span class="alert-msg">${msg}</span>
    `;

    feed.prepend(item);

    // Keep max 50 alerts
    if (feed.children.length > 50) {
      feed.removeChild(feed.lastChild);
    }
  };

  // === INIT ===
  async function init() {
    initAuth();
    initScene();
    window.addEventListener('mousemove', e => { mouseX = (e.clientX / window.innerWidth - 0.5) * 2; mouseY = (e.clientY / window.innerHeight - 0.5) * 2 }, { passive: true });
    window.addEventListener('resize', () => { const w = window.innerWidth, h = window.innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h) });
    animate();
    await runLoading();
    initNav();
    // Video autoplays via HTML attributes — ensure playback starts
    const heroVideo = document.getElementById('hero-video');
    if (heroVideo) heroVideo.play().catch(() => {});
    initScroll();
    animateHero();
    initDashboard();
    initAnalytics();
    initAIEngine();
    initControl();
    initAlerts();
    initSettings();
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();

  // ============================================================
  // PHASE 3 — Module : Paramètres d'Irrigation (ET0)
  // ============================================================
  function initSettings() {

    // ── Éléments DOM ──────────────────────────────────────────
    const modal        = document.getElementById('modal-settings');
    const btnOpen      = document.getElementById('btn-open-settings');
    const btnClose     = document.getElementById('btn-close-settings');
    const btnCancel    = document.getElementById('btn-cancel-settings');
    const btnSave      = document.getElementById('btn-save-settings');
    const btnSaveText  = document.getElementById('btn-save-text');

    const selectVille  = document.getElementById('select-ville');
    const selectSol    = document.getElementById('select-sol');
    const selectPlante = document.getElementById('select-plante');

    const previewVilleImg  = document.getElementById('preview-ville-img');
    const previewVilleNom  = document.getElementById('preview-ville-nom');
    const previewSolImg    = document.getElementById('preview-sol-img');
    const previewSolNom    = document.getElementById('preview-sol-nom');
    const hintSol          = document.getElementById('hint-sol');
    const previewPlanteImg = document.getElementById('preview-plante-img');
    const previewPlanteNom = document.getElementById('preview-plante-nom');
    const hintPlante       = document.getElementById('hint-plante');
    const configActiveText = document.getElementById('config-active-text');
    const navBadge         = document.getElementById('settings-active-badge');

    if (!modal || !btnOpen) return;

    // Données chargées depuis le backend
    let referentiels = { villes: [], sols: [], plantes: [] };

    // ── Ouvrir / Fermer le modal ───────────────────────────────
    function openModal() {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      chargerReferentiels();
    }
    function closeModal() {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }

    btnOpen.addEventListener('click', openModal);
    btnClose.addEventListener('click', closeModal);
    btnCancel.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    // ── Charger les référentiels depuis le backend ─────────────
    async function chargerReferentiels() {
      try {
        const res = await fetch(`${API_BASE}/api/config/referentiels`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        referentiels = await res.json();

        peuplerDropdown(selectVille,  referentiels.villes,  'nom', 'ville');
        peuplerDropdown(selectSol,    referentiels.sols,    'nom', 'sol');
        peuplerDropdown(selectPlante, referentiels.plantes, 'nom', 'plante');

        peuplerGalleriePlantes(referentiels.plantes);
        peuplerGallerieSols(referentiels.sols);
        peuplerGalerieVilles(referentiels.villes);
        await chargerConfigActive();
      } catch (err) {
        console.error('[Settings] Erreur chargement referentiels:', err);
        configActiveText.textContent = '⚠️ Impossible de charger les données.';
      }
    }

    // ── Charger la config active et pré-sélectionner les dropdowns ──
    async function chargerConfigActive() {
      try {
        const res = await fetch(`${API_BASE}/api/config/active`);
        if (!res.ok) return;
        const cfg = await res.json();

        if (cfg.ville_id) selectVille.value  = cfg.ville_id;
        if (cfg.sol_id)   selectSol.value    = cfg.sol_id;
        if (cfg.plante_id) selectPlante.value = cfg.plante_id;

        // Mettre à jour les aperçus
        mettreAJourPreview('ville', cfg.ville_id);
        mettreAJourPreview('sol',   cfg.sol_id);
        mettreAJourPreview('plante', cfg.plante_id);

        // Mettre à jour le bandeau de config active
        if (cfg.ville_nom && cfg.sol_nom && cfg.plante_nom) {
          configActiveText.textContent = `${cfg.ville_nom}  ·  ${cfg.sol_nom}  ·  ${cfg.plante_nom}`;
          if (navBadge) navBadge.textContent = cfg.ville_nom;
        }
      } catch (err) {
        console.warn('[Settings] Impossible de charger la config active:', err);
      }
    }

    // ── Onglets de la galerie ─────────────────────────────────
    document.querySelectorAll('.gallery-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gallery-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        ['plantes', 'sols', 'villes'].forEach(t => {
          const pane = document.getElementById(`gallery-pane-${t}`);
          if (pane) pane.style.display = t === tab ? '' : 'none';
        });
      });
    });

    // ── Constructeur générique de galerie ─────────────────────
    function construireGalerie(gridId, items, { imgFallback, badge, onSelect, getActiveId }) {
      const grid = document.getElementById(gridId);
      if (!grid) return;
      grid.innerHTML = '';
      items.forEach(item => {
        const imgSrc = item.image_url || imgFallback;
        const card = document.createElement('div');
        card.className = 'gallery-card';
        card.dataset.id = item.id;
        card.innerHTML = `
          <img src="${imgSrc}" alt="${item.nom}" onerror="this.src='${imgFallback}'" loading="lazy" />
          ${badge(item) ? `<span class="gallery-card-kc">${badge(item)}</span>` : ''}
          <span class="gallery-card-label">${item.nom}</span>
        `;
        card.addEventListener('click', () => onSelect(item, card));
        grid.appendChild(card);
      });
      rafraichirGalerieActive(gridId, getActiveId());
    }

    function rafraichirGalerieActive(gridId, activeId) {
      document.querySelectorAll(`#${gridId} .gallery-card`).forEach(c => {
        c.classList.toggle('gallery-active', parseInt(c.dataset.id) === parseInt(activeId));
      });
    }

    // ── Galerie des plantes ───────────────────────────────────
    function peuplerGalleriePlantes(plantes) {
      construireGalerie('gallery-plantes', plantes, {
        imgFallback: '/assets/images/plantes/default.jpg',
        badge: p => `Kc ${p.kc}`,
        onSelect: (plante) => {
          selectPlante.value = plante.id;
          selectPlante.dataset.prevValue = plante.id;
          mettreAJourPreview('plante', plante.id);
        },
        getActiveId: () => selectPlante.value
      });
    }

    // ── Galerie des sols ──────────────────────────────────────
    function peuplerGallerieSols(sols) {
      construireGalerie('gallery-sols', sols, {
        imgFallback: '/assets/images/sols/default.jpg',
        badge: s => s.facteur_conversion_mm ? `${s.facteur_conversion_mm} mm/%` : '',
        onSelect: (sol) => {
          selectSol.value = sol.id;
          selectSol.dataset.prevValue = sol.id;
          mettreAJourPreview('sol', sol.id);
        },
        getActiveId: () => selectSol.value
      });
    }

    // ── Galerie des villes ────────────────────────────────────
    function peuplerGalerieVilles(villes) {
      construireGalerie('gallery-villes', villes, {
        imgFallback: '/assets/images/villes/default.jpg',
        badge: v => v.latitude ? `${parseFloat(v.latitude).toFixed(1)}°N` : '',
        onSelect: (ville) => {
          selectVille.value = ville.id;
          selectVille.dataset.prevValue = ville.id;
          mettreAJourPreview('ville', ville.id);
        },
        getActiveId: () => selectVille.value
      });
    }

    // ── Mettre en surbrillance la carte active dans la galerie ─
    function mettreAJourGalerie(planteId) {
      rafraichirGalerieActive('gallery-plantes', planteId);
    }

    // ── Peupler un <select> ───────────────────────────────────
    function peuplerDropdown(selectEl, items, labelKey, type) {
      if (!selectEl) return;
      const current = selectEl.value;
      selectEl.innerHTML = '';
      items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item[labelKey];
        selectEl.appendChild(opt);
      });
      // Option Ajouter Nouveau
      const optNew = document.createElement('option');
      optNew.value = 'add_new';
      optNew.textContent = '➕ Ajouter un(e) nouveau...';
      optNew.style.fontWeight = 'bold';
      selectEl.appendChild(optNew);

      if (current && current !== 'add_new') selectEl.value = current;
      selectEl.dataset.prevValue = selectEl.value; // Store to revert if cancelled
    }

    // ── Mettre à jour l'aperçu image ──────────────────────────
    function mettreAJourPreview(type, id) {
      const idNum = parseInt(id, 10);
      if (!idNum) return;

      if (type === 'ville') {
        const item = referentiels.villes.find(v => v.id === idNum);
        if (!item) return;
        previewVilleImg.src = item.image_url || '/assets/images/villes/default.jpg';
        previewVilleNom.textContent = item.nom;
        rafraichirGalerieActive('gallery-villes', idNum);
      } else if (type === 'sol') {
        const item = referentiels.sols.find(s => s.id === idNum);
        if (!item) return;
        previewSolImg.src = item.image_url || '/assets/images/sols/default.jpg';
        previewSolNom.textContent = item.nom;
        hintSol.textContent = `Facteur sol : ${item.facteur_conversion_mm} mm/%  ·  ${item.description || ''}`;
        rafraichirGalerieActive('gallery-sols', idNum);
      } else if (type === 'plante') {
        const item = referentiels.plantes.find(p => p.id === idNum);
        if (!item) return;
        previewPlanteImg.src = item.image_url || '/assets/images/plantes/default.jpg';
        previewPlanteNom.textContent = item.nom;
        hintPlante.textContent = `Coefficient Kc : ${item.kc}  ·  ${item.description || ''}`;
        mettreAJourGalerie(idNum);
      }
    }

    // ── Écouter les changements de dropdown ───────────────────
    function handleSelectChange(type, selectEl) {
      if (selectEl.value === 'add_new') {
        openAddRefModal(type, selectEl);
      } else {
        selectEl.dataset.prevValue = selectEl.value;
        mettreAJourPreview(type, selectEl.value);
      }
    }

    selectVille.addEventListener('change',  () => handleSelectChange('ville',  selectVille));
    selectSol.addEventListener('change',   () => handleSelectChange('sol',   selectSol));
    selectPlante.addEventListener('change', () => handleSelectChange('plante', selectPlante));

    // ── GESTION DU MODAL D'AJOUT DYNAMIQUE ────────────────────
    const modalAddRef = document.getElementById('modal-add-ref');
    const btnCloseAddRef = document.getElementById('btn-close-add-ref');
    const btnCancelAddRef = document.getElementById('btn-cancel-add-ref');
    const btnSubmitAddRef = document.getElementById('btn-submit-add-ref');
    
    let currentAddSelect = null;

    function openAddRefModal(type, selectEl) {
      currentAddSelect = selectEl;
      
      document.getElementById('add-ref-type').value = type;
      document.getElementById('add-ref-error').style.display = 'none';
      document.getElementById('add-ref-nom').value = '';
      
      // Reset image upload
      const fileInput = document.getElementById('add-ref-file');
      const imgPreview = document.getElementById('add-ref-img-preview');
      const imgIcon = document.getElementById('add-ref-img-icon');
      if(fileInput) fileInput.value = '';
      if(imgPreview) { imgPreview.src = ''; imgPreview.style.display = 'none'; }
      if(imgIcon) imgIcon.style.display = 'flex';
      
      document.getElementById('add-ref-fields-ville').style.display = type === 'ville' ? 'flex' : 'none';
      document.getElementById('add-ref-fields-plante').style.display = type === 'plante' ? 'flex' : 'none';
      document.getElementById('add-ref-fields-sol').style.display = type === 'sol' ? 'flex' : 'none';
      document.getElementById('add-ref-fields-desc').style.display = (type === 'plante' || type === 'sol') ? 'flex' : 'none';
      
      // Vider les champs spécifiques
      if(type==='ville'){ document.getElementById('add-ref-lat').value=''; document.getElementById('add-ref-lon').value=''; }
      if(type==='plante'){ document.getElementById('add-ref-kc').value=''; document.getElementById('add-ref-desc').value=''; }
      if(type==='sol'){ document.getElementById('add-ref-facteur').value=''; document.getElementById('add-ref-desc').value=''; }

      let title = "Ajouter";
      if(type === 'ville') title = "🏙️ Nouvelle Ville";
      if(type === 'plante') title = "🌱 Nouvelle Culture";
      if(type === 'sol') title = "🪨 Nouveau Sol";
      document.getElementById('add-ref-title').textContent = title;
      
      modalAddRef.style.display = 'flex';
    }

    function closeAddRefModal() {
      modalAddRef.style.display = 'none';
      if (currentAddSelect && currentAddSelect.value === 'add_new') {
        currentAddSelect.value = currentAddSelect.dataset.prevValue || '';
      }
    }

    if(btnCloseAddRef) btnCloseAddRef.addEventListener('click', closeAddRefModal);
    if(btnCancelAddRef) btnCancelAddRef.addEventListener('click', closeAddRefModal);

    // Prévisualisation de l'image
    const fileInput = document.getElementById('add-ref-file');
    if(fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          const imgPreview = document.getElementById('add-ref-img-preview');
          const imgIcon = document.getElementById('add-ref-img-icon');
          imgPreview.src = evt.target.result;
          imgPreview.style.display = 'block';
          imgIcon.style.display = 'none';
        };
        reader.readAsDataURL(file);
      });
    }

    if(btnSubmitAddRef) {
      btnSubmitAddRef.addEventListener('click', async () => {
        const type = document.getElementById('add-ref-type').value;
        const nom = document.getElementById('add-ref-nom').value;
        const file = document.getElementById('add-ref-file').files[0];
        const errorDiv = document.getElementById('add-ref-error');
        
        const formData = new FormData();
        formData.append('nom', nom);
        if (file) formData.append('image', file);
        
        let endpoint = '';
        
        if (type === 'ville') {
          formData.append('latitude', document.getElementById('add-ref-lat').value);
          formData.append('longitude', document.getElementById('add-ref-lon').value);
          endpoint = '/api/config/villes';
        } else if (type === 'plante') {
          formData.append('kc', document.getElementById('add-ref-kc').value);
          formData.append('description', document.getElementById('add-ref-desc').value);
          endpoint = '/api/config/plantes';
        } else if (type === 'sol') {
          formData.append('facteur_conversion_mm', document.getElementById('add-ref-facteur').value);
          formData.append('description', document.getElementById('add-ref-desc').value);
          endpoint = '/api/config/sols';
        }

        btnSubmitAddRef.disabled = true;
        btnSubmitAddRef.innerHTML = '<span>Enregistrement...</span>';

        try {
          const res = await fetch(API_BASE + endpoint, {
            method: 'POST',
            // On ne met PAS de Content-Type car FormData s'occupe du boundary
            body: formData
          });
          
          const data = await res.json();
          if (!res.ok) throw new Error(data.erreur || 'Erreur lors de la création');
          
          // Mettre à jour la liste locale
          let newItem = data;
          let items = [];
          if(type === 'ville') { referentiels.villes.push(newItem); items = referentiels.villes; }
          if(type === 'plante') { referentiels.plantes.push(newItem); items = referentiels.plantes; }
          if(type === 'sol') { referentiels.sols.push(newItem); items = referentiels.sols; }
          
          // Re-peupler le dropdown
          peuplerDropdown(currentAddSelect, items, 'nom', type);
          
          // Sélectionner la nouvelle option
          currentAddSelect.value = newItem.id;
          currentAddSelect.dataset.prevValue = newItem.id;
          mettreAJourPreview(type, newItem.id);
          
          modalAddRef.style.display = 'none';
        } catch (err) {
          errorDiv.textContent = err.message;
          errorDiv.style.display = 'block';
        } finally {
          btnSubmitAddRef.disabled = false;
          btnSubmitAddRef.innerHTML = '<span>Enregistrer</span>';
        }
      });
    }

    // ── Sauvegarder la configuration ──────────────────────────
    btnSave.addEventListener('click', async () => {
      const ville_id  = parseInt(selectVille.value, 10);
      const sol_id    = parseInt(selectSol.value, 10);
      const plante_id = parseInt(selectPlante.value, 10);

      if (!ville_id || !sol_id || !plante_id) {
        alert('⚠️ Veuillez sélectionner une ville, un type de sol et une culture.');
        return;
      }

      // Afficher l'état de chargement
      btnSave.disabled = true;
      btnSaveText.textContent = '⏳ Enregistrement...';

      try {
        const res = await fetch(`${API_BASE}/api/config/appliquer`, {
          method  : 'POST',
          headers : { 'Content-Type': 'application/json' },
          body    : JSON.stringify({ ville_id, sol_id, plante_id })
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.erreur || 'Erreur serveur');

        // Succès : mettre à jour l'UI
        const { ville, sol, plante } = data.config;
        configActiveText.textContent = `${ville.nom}  ·  ${sol.nom}  ·  ${plante.nom}`;
        if (navBadge) navBadge.textContent = ville.nom;
        btnSaveText.textContent = '✅ Configuration Appliquée !';

        setTimeout(() => {
          btnSaveText.textContent = '💾 Appliquer la Configuration';
          btnSave.disabled = false;
          closeModal();
        }, 1500);

      } catch (err) {
        console.error('[Settings] Erreur sauvegarde:', err);
        btnSaveText.textContent = `❌ Erreur : ${err.message}`;
        setTimeout(() => {
          btnSaveText.textContent = '💾 Appliquer la Configuration';
          btnSave.disabled = false;
        }, 3000);
      }
    });

    // Charger la config active au démarrage (pour le badge navbar)
    fetch(`${API_BASE}/api/config/active`)
      .then(r => r.ok ? r.json() : null)
      .then(cfg => { if (cfg && cfg.ville_nom && navBadge) navBadge.textContent = cfg.ville_nom; })
      .catch(() => {});
  }

  // ============================================================
  // PHASE 3 (Sécurité) — Module : Authentification JWT
  // ============================================================
  function initAuth() {
    const token = localStorage.getItem('soussrover_jwt');

    // ── GESTION DE L'ÉTAT INITIAL ──
    if (token) {
      // Admin Connecté
      document.body.classList.add('logged-in');
    } else {
      // Visiteur
      document.body.classList.remove('logged-in');
    }

    // ── ÉLÉMENTS DOM ──
    const modalLogin = document.getElementById('modal-login');
    const btnOpenLogin1 = document.getElementById('hero-login-btn');
    const btnOpenLogin2 = document.getElementById('hero-login-btn-2');
    const btnCloseLogin = document.getElementById('btn-close-login');
    const btnSubmitLogin = document.getElementById('btn-submit-login');
    const btnLogout = document.getElementById('btn-logout');
    
    const inputUser = document.getElementById('login-username');
    const inputPass = document.getElementById('login-password');
    const errorDiv = document.getElementById('login-error');

    // ── ACTIONS DU MODAL ──
    const openLogin = () => { if(modalLogin) modalLogin.style.display = 'flex'; };
    const closeLogin = () => { if(modalLogin) modalLogin.style.display = 'none'; errorDiv.style.display = 'none'; };

    if (btnOpenLogin1) btnOpenLogin1.addEventListener('click', openLogin);
    if (btnOpenLogin2) btnOpenLogin2.addEventListener('click', openLogin);
    if (btnCloseLogin) btnCloseLogin.addEventListener('click', closeLogin);

    // ── SOUMISSION DU FORMULAIRE ──
    if (btnSubmitLogin) {
      btnSubmitLogin.addEventListener('click', async () => {
        const username = inputUser.value;
        const password = inputPass.value;

        if (!username || !password) {
          errorDiv.textContent = "Veuillez remplir tous les champs.";
          errorDiv.style.display = 'block';
          return;
        }

        btnSubmitLogin.disabled = true;
        btnSubmitLogin.innerHTML = '<span>Connexion...</span>';

        try {
          const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          const data = await res.json();

          if (res.ok && data.success) {
            localStorage.setItem('soussrover_jwt', data.token);
            window.location.reload(); // Recharger pour appliquer l'état et connecter Socket.io
          } else {
            errorDiv.textContent = data.erreur || "Identifiants incorrects.";
            errorDiv.style.display = 'block';
          }
        } catch (err) {
          errorDiv.textContent = "Erreur de connexion au serveur.";
          errorDiv.style.display = 'block';
        } finally {
          btnSubmitLogin.disabled = false;
          btnSubmitLogin.innerHTML = '<span>Se Connecter</span>';
        }
      });
    }

    // ── DÉCONNEXION ──
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        localStorage.removeItem('soussrover_jwt');
        window.location.reload();
      });
    }

    // ── ATTACHER LE TOKEN AUX REQUÊTES FETCH GLOBALES (optionnel pour les routes GET protégées plus tard) ──
    // On surcharge fetch globalement pour injecter le token
    const { fetch: originalFetch } = window;
    window.fetch = async (...args) => {
      let [resource, config] = args;
      if (localStorage.getItem('soussrover_jwt')) {
        config = config || {};
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${localStorage.getItem('soussrover_jwt')}`;
      }
      return originalFetch(resource, config);
    };
  }

})();
