'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
// We need to import the shaders and effects from three/examples
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export default function Blackhole() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // 🌟🌟🌟 HIGH-END MATHEMATICAL 3D BLACK HOLE 🌟🌟🌟
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Fit to container instead of window
    const updateSize = () => {
      if (mountRef.current) {
        const { clientWidth, clientHeight } = mountRef.current;
        renderer.setSize(clientWidth, clientHeight);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
        composer.setSize(clientWidth, clientHeight);
      }
    };

    mountRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.001);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    camera.position.set(0, 15, 60);
    camera.lookAt(0, 0, 0);

    // Create the Event Horizon (The textured void)
    const sphereGeo = new THREE.SphereGeometry(4, 64, 64); // Scaled down: 10 -> 4
    const sphereMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        varying vec2 vUv;
        varying vec3 vNormal;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          float a = hash(i); float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        void main() {
          // 4K Micro-texture: High frequency, low amplitude noise
          float n1 = noise(vUv * 40.0 + time * 0.05);
          float n2 = noise(vUv * 80.0 - time * 0.02);
          float microTexture = mix(n1, n2, 0.5);
          
          float rim = 1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);
          rim = pow(rim, 8.0); // Tighter rim
          
          // Deep absolute black with micro-detail
          vec3 color = vec3(0.002 + microTexture * 0.005);
          color += vec3(1.0, 0.3, 0.05) * rim * 0.05; // Subtle thermal rim
          
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    const eventHorizon = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(eventHorizon);

    // 🌟 10X UPGRADE: High-Speed Signal Streaks escaping the event horizon 🌟
    const streakCount = 150;
    const sGeo = new THREE.BufferGeometry();
    const sPos = new Float32Array(streakCount * 3);
    const sVel = new Float32Array(streakCount * 3); // Velocity
    const sAlpha = new Float32Array(streakCount);

    for(let i=0; i<streakCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 10 + Math.random() * 2;
        sPos[i*3] = Math.cos(angle) * radius;
        sPos[i*3+1] = (Math.random() - 0.5) * 4;
        sPos[i*3+2] = Math.sin(angle) * radius;

        sVel[i*3] = Math.cos(angle) * (1 + Math.random() * 2);
        sVel[i*3+1] = (Math.random() - 0.5) * 2;
        sVel[i*3+2] = Math.sin(angle) * (1 + Math.random() * 2);

        sAlpha[i] = Math.random();
    }
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute('alpha', new THREE.BufferAttribute(sAlpha, 1));

    const sMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 4.0 * (30.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 xy = gl_PointCoord.xy - vec2(0.5);
          float ll = length(xy);
          if(ll > 0.5) discard;
          // Ultra-bright orange/white streaks
          gl_FragColor = vec4(1.0, 0.6, 0.1, vAlpha * (0.5 - ll) * 2.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const streaks = new THREE.Points(sGeo, sMat);
    scene.add(streaks);


    // Create the Accretion Disk using 100,000 mathematically placed particles
    const particleCount = 100000;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(particleCount * 3);
    const pColors = new Float32Array(particleCount * 3);
    const pSizes = new Float32Array(particleCount);

    const colorCore = new THREE.Color(0xffeebb); // Light amber (not pure white)
    const colorMid = new THREE.Color(0xffaa44);  // Warm Gold
    const colorOuter = new THREE.Color(0xcc3300); // Deep magma red

    for(let i=0; i<particleCount; i++) {
        // Math for disk distribution (denser near the center, scaled down)
        const distance = 4.2 + Math.pow(Math.random(), 2.5) * 20;
        const theta = Math.random() * Math.PI * 2;
        
        const heightSpread = (1 - (distance - 4.2)/20) * 0.8;
        const y = (Math.random() - 0.5) * heightSpread * distance * 0.15;

        pPos[i*3] = Math.cos(theta) * distance;
        pPos[i*3+1] = y;
        pPos[i*3+2] = Math.sin(theta) * distance;
        
        pSizes[i] = Math.random() * 1.2;
        
        const normalizedDist = (distance - 4.2) / 20;
        let c = new THREE.Color();
        
        if(normalizedDist < 0.15) {
            c.lerpColors(colorCore, colorMid, normalizedDist / 0.15);
        } else {
            c.lerpColors(colorMid, colorOuter, (normalizedDist - 0.15) / 0.85);
        }
        
        // Add random noise to color
        c.r += (Math.random()-0.5)*0.2;
        c.g += (Math.random()-0.5)*0.2;
        
        pColors[i*3] = c.r;
        pColors[i*3+1] = c.g;
        pColors[i*3+2] = c.b;
    }

    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
    pGeo.setAttribute('size', new THREE.BufferAttribute(pSizes, 1));

    // Custom shader material for particles to give them a glowing soft edge
    const pMat = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: `
            attribute float size;
            attribute vec3 color;
            varying vec3 vColor;
            varying float vNoise;
            uniform float time;

            // Simple noise function for vertex displacement
            float hash(float n) { return fract(sin(n) * 43758.5453123); }
            
            void main() {
                vColor = color;
                vec3 pos = position;
                float dist = length(pos.xz);
                float speed = 4.0 / sqrt(dist);
                float angle = speed * time;
                float s = sin(angle);
                float c = cos(angle);
                pos.x = position.x * c - position.z * s;
                pos.z = position.x * s + position.z * c;
                
                // Subtle procedural wave across the WHOLE circle
                float wave = sin(dist * 0.4 - time * 0.8) * 0.3;
                pos.y += wave;
                
                // Realistic Lensing: bend particles around the black hole (symmetrical-ish)
                float lensEffect = smoothstep(22.0, 8.0, dist);
                if(pos.z < -1.0) {
                    // Top arch
                    pos.y += 12.0 * lensEffect * (abs(pos.z)/25.0);
                } else if(pos.z > 1.0) {
                    // Bottom subtle warp to complete the 'whole circle' feel
                    pos.y -= 4.0 * lensEffect * (abs(pos.z)/25.0);
                }
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_PointSize = size * (45.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
                vNoise = hash(dist + time * 0.1);
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vNoise;
            void main() {
                vec2 xy = gl_PointCoord.xy - vec2(0.5);
                float ll = length(xy);
                if(ll > 0.5) discard;
                
                // Texture: Add 'plasma' noise variation
                float noise = vNoise * 0.5 + 0.5;
                float alpha = (0.5 - ll) * 2.0 * noise;
                
                // Thermal Glow: Inner particles are brighter
                gl_FragColor = vec4(vColor * (1.1 + noise * 0.2), alpha * 0.4);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const disk = new THREE.Points(pGeo, pMat);
    // Tilt the disk for the classic Interstellar view
    disk.rotation.x = 0.1;
    disk.rotation.z = -0.15;
    scene.add(disk);

    // Gravitational Lensing Ring (Photon Sphere)
    const ringGeo = new THREE.TorusGeometry(4.1, 0.15, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0xffaa55, 
        transparent: true, 
        opacity: 0.1,
        blending: THREE.AdditiveBlending
    });
    const photonRing = new THREE.Mesh(ringGeo, ringMat);
    photonRing.rotation.x = Math.PI / 2;
    scene.add(photonRing);

    // Background Stars
    const starCount = 5000;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for(let i=0; i<starCount; i++) {
        starPos[i*3] = (Math.random()-0.5) * 1000;
        starPos[i*3+1] = (Math.random()-0.5) * 1000;
        starPos[i*3+2] = (Math.random()-0.5) * 1000;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({color: 0xffffff, size: 0.5, transparent: true, opacity: 0.5});
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Cinematic Post-Processing
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.4, 0.85);
    bloomPass.threshold = 0.45; 
    bloomPass.strength = 0.8; 
    bloomPass.radius = 1.0;

    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    updateSize();

    // Scroll tracking for "Dive" effect (ONLY INTERACTION)
    let scrollY = 0;
    const onScroll = () => {
      scrollY = window.scrollY;
    };
    window.addEventListener('scroll', onScroll);
    window.addEventListener('resize', updateSize);

    const clock = new THREE.Clock();
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      
      // Update shader time
      pMat.uniforms.time.value = time * 0.15;
      sphereMat.uniforms.time.value = time;

      // Orbital Scroll Logic (Circling without zooming)
      const scrollFactor = window.scrollY / 1000;
      const angle = scrollFactor * Math.PI * 0.5; // Rotate 90 degrees on scroll
      const radius = 80;
      
      camera.position.x = Math.sin(angle) * radius;
      camera.position.z = Math.cos(angle) * radius;
      camera.position.y = 20 + Math.sin(angle * 0.5) * 10;
      
      camera.lookAt(0, 0, 0);

      // Bloom intensity shift (subtle)
      bloomPass.strength = 0.8 + (Math.sin(time * 0.5) * 0.05);

      // Animate signal streaks
      const posAttr = sGeo.attributes.position;
      const alphaAttr = sGeo.attributes.alpha;
      for(let i=0; i<streakCount; i++) {
        posAttr.array[i*3] += sVel[i*3] * 0.4;
        posAttr.array[i*3+1] += sVel[i*3+1] * 0.4;
        posAttr.array[i*3+2] += sVel[i*3+2] * 0.4;
        alphaAttr.array[i] -= 0.01;

        const dist = Math.sqrt(Math.pow(posAttr.array[i*3], 2) + Math.pow(posAttr.array[i*3+2], 2));
        if(alphaAttr.array[i] <= 0 || dist > 50) {
          const angle = Math.random() * Math.PI * 2;
          posAttr.array[i*3] = Math.cos(angle) * 10.2;
          posAttr.array[i*3+1] = (Math.random() - 0.5) * 1.5;
          posAttr.array[i*3+2] = Math.sin(angle) * 10.2;
          sVel[i*3] = Math.cos(angle) * (2 + Math.random() * 2);
          sVel[i*3+1] = (Math.random() - 0.5) * 1.5;
          sVel[i*3+2] = Math.sin(angle) * (2 + Math.random() * 2);
          alphaAttr.array[i] = 1.0;
        }
      }
      posAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;

      composer.render();
    };
    
    animate();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', updateSize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full absolute inset-0 z-0" />;
}
