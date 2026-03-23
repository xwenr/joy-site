"use client";

import { useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { useTexture, Html, useScroll } from "@react-three/drei";
import { type GalleryEntry } from "@/lib/content-types";

const skewVertexShader = `
  uniform float uSkewY;
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    vec3 pos = position;
    pos.y += pos.x * uSkewY;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

// --- Custom Shader for Skew Y and Edge Fade (Breathing Glass) ---
const SkewCardMaterial = {
  uniforms: {
    uTexture: { value: null },
    uSkewY: { value: -0.2 }, // Negative value = Left side is higher, right side is lower
    uHover: { value: 0.0 },
    uImageAspect: { value: 1.0 }, // To maintain image proportions
    uPlaneAspect: { value: 1.0 }, // Plane width/height ratio
  },
  vertexShader: skewVertexShader,
  fragmentShader: `
    uniform sampler2D uTexture;
    uniform float uHover;
    varying vec2 vUv;
    
    void main() {
      // 1. Get original image color
      vec4 texColor = texture2D(uTexture, vUv);
      
      // 2. Build two separate masks:
      // - silhouetteAlpha keeps the physical card edge crisp and readable
      // - contentAlpha softly fades only the image content near the edge
      float edgeDistX = min(vUv.x, 1.0 - vUv.x);
      float edgeDistY = min(vUv.y, 1.0 - vUv.y);
      
      // Keep an almost hard silhouette, with only a tiny falloff.
      float silhouetteAlphaX = smoothstep(0.001, 0.012, edgeDistX);
      float silhouetteAlphaY = smoothstep(0.001, 0.012, edgeDistY);
      float silhouetteAlpha = min(silhouetteAlphaX, silhouetteAlphaY);

      // Slightly wider content fade so the edge breathes more,
      // while the separate silhouette mask keeps the card boundary readable.
      float contentAlphaX = smoothstep(0.008, 0.095, edgeDistX);
      float contentAlphaY = smoothstep(0.008, 0.09, edgeDistY);
      float contentAlpha = min(contentAlphaX, contentAlphaY);
      
      // Keep the original image color only. No bevel tint, no grey wash.
      vec3 rgb = texColor.rgb;

      // 4. Global Opacity calculation
      // Preserve a visible outer silhouette while letting the content breathe
      // inward toward the edge.
      float baseOpacity = 0.62;
      float targetAlpha = baseOpacity * silhouetteAlpha + (1.0 - baseOpacity) * contentAlpha;
      
      // Hover makes it slightly more opaque
      float outputAlpha = clamp(targetAlpha + (uHover * 0.1), 0.0, 1.0);
      
      gl_FragColor = vec4(rgb, outputAlpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
};

function createQuadGeometry(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number]
) {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    ...a, ...b, ...c,
    ...a, ...c, ...d,
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

interface GlassCardProps {
  entry: GalleryEntry;
  index: number;
  total: number;
  onSelect: (entry: GalleryEntry) => void;
}

// Configuration based on PRD
const CONFIG = {
  spacing: {
    x: 1.5,   // Adjusted from 1.8 to 1.5 per user request
    y: 0.45,  
    z: -0.05,
  },
  hoverPullout: 0.5,
};

function hasImageDimensions(
  image: unknown,
): image is { width: number; height: number } {
  return (
    typeof image === "object" &&
    image !== null &&
    "width" in image &&
    "height" in image &&
    typeof image.width === "number" &&
    typeof image.height === "number"
  );
}

export function GlassCard({ entry, index, total, onSelect }: GlassCardProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const topFaceMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const rightFaceMatRef = useRef<THREE.MeshBasicMaterial>(null);
  
  // State for hover tracking
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // Local mouse position for the text
  const [targetMousePos, setTargetMousePos] = useState({ x: 0, y: 0 }); // Target for smooth damping

  const { viewport } = useThree();
  
  const texture = useTexture(entry.image);
  texture.colorSpace = THREE.SRGBColorSpace;
  const textureImage = texture.image;
  
  const baseX = index * CONFIG.spacing.x;
  const baseY = index * CONFIG.spacing.y;
  const baseZ = index * CONFIG.spacing.z;

  const imageAspect = hasImageDimensions(textureImage)
    ? textureImage.width / textureImage.height
    : 4 / 3;

  // Responsive Dimensions based on original image aspect ratio
  const height = viewport.height * 0.42;
  const width = height * imageAspect;
  const skewY = -0.2;

  const thicknessOffsetX = width * 0.008;
  const thicknessOffsetY = height * 0.01;
  const thicknessOffsetZ = -0.008;

  const uniforms = useMemo(() => ({
    uTexture: { value: texture },
    uSkewY: { value: skewY },
    uHover: { value: 0.0 },
    uImageAspect: { value: imageAspect },
    uPlaneAspect: { value: width / height },
  }), [texture, imageAspect, width, height, skewY]);

  const { topFaceGeometry, rightFaceGeometry } = useMemo(() => {
    const halfW = width / 2;
    const halfH = height / 2;

    const frontTL: [number, number, number] = [-halfW, halfH + (-halfW * skewY), 0.0];
    const frontTR: [number, number, number] = [halfW, halfH + (halfW * skewY), 0.0];
    const frontBR: [number, number, number] = [halfW, -halfH + (halfW * skewY), 0.0];

    const backTL: [number, number, number] = [
      frontTL[0] + thicknessOffsetX,
      frontTL[1] + thicknessOffsetY,
      thicknessOffsetZ,
    ];
    const backTR: [number, number, number] = [
      frontTR[0] + thicknessOffsetX,
      frontTR[1] + thicknessOffsetY,
      thicknessOffsetZ,
    ];
    const backBR: [number, number, number] = [
      frontBR[0] + thicknessOffsetX,
      frontBR[1] + thicknessOffsetY,
      thicknessOffsetZ,
    ];

    return {
      topFaceGeometry: createQuadGeometry(frontTL, frontTR, backTR, backTL),
      rightFaceGeometry: createQuadGeometry(frontBR, frontTR, backTR, backBR),
    };
  }, [width, height, skewY, thicknessOffsetX, thicknessOffsetY, thicknessOffsetZ]);

  // Handle mouse movement over the mesh
  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    // e.point is the world coordinate of the intersection
    // We want the text to float near the mouse, but slightly offset
    setTargetMousePos({
      x: e.point.x - baseX, // Convert world to local (relative to this card)
      y: e.point.y - baseY,
    });
  };

  useFrame((state, delta) => {
    if (!groupRef.current || !materialRef.current) return;

    // Hover Interaction: Pull out horizontally
    const targetX = baseX + (hovered ? 1.25 : 0);
    groupRef.current.position.x = THREE.MathUtils.damp(
      groupRef.current.position.x,
      targetX,
      6,
      delta
    );

    // Animate shader uniform for hover
    materialRef.current.uniforms.uHover.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uHover.value,
      hovered ? 1.0 : 0.0,
      6,
      delta
    );

    if (topFaceMatRef.current) {
      topFaceMatRef.current.opacity = THREE.MathUtils.damp(
        topFaceMatRef.current.opacity,
        hovered ? 0.24 : 0.2,
        6,
        delta
      );
    }

    if (rightFaceMatRef.current) {
      rightFaceMatRef.current.opacity = THREE.MathUtils.damp(
        rightFaceMatRef.current.opacity,
        hovered ? 0.3 : 0.26,
        6,
        delta
      );
    }

    // Smoothly damp the mouse position for the floating text
    if (hovered) {
      setMousePos({
        x: THREE.MathUtils.damp(mousePos.x, targetMousePos.x, 8, delta),
        y: THREE.MathUtils.damp(mousePos.y, targetMousePos.y, 8, delta),
      });
    }
  });

  return (
    <group 
      ref={groupRef}
      position={[baseX, baseY, baseZ]}
    >
      <mesh geometry={topFaceGeometry} position={[0, 0, -0.001]}>
        <meshBasicMaterial
          ref={topFaceMatRef}
          color="#0d0d0f"
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh geometry={rightFaceGeometry} position={[0, 0, -0.001]}>
        <meshBasicMaterial
          ref={rightFaceMatRef}
          color="#040405"
          transparent
          opacity={0.26}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh
        position={[0, 0, 0.01]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
          handlePointerMove(e);
        }}
        onPointerMove={handlePointerMove}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(entry);
        }}
      >
        <planeGeometry args={[width, height, 32, 32]} />
        
        <shaderMaterial
          ref={materialRef}
          vertexShader={SkewCardMaterial.vertexShader}
          fragmentShader={SkewCardMaterial.fragmentShader}
          uniforms={uniforms}
          transparent={true} // Enabled again, but alpha is controlled by edge mask
          depthWrite={false}
        />

        {/* Floating HTML Overlay for Title - Follows Mouse */}
        {hovered && (
          <Html
            // Position it exactly at the mouse cursor local position
            position={[mousePos.x, mousePos.y, 0.01]} 
            center
            style={{
              pointerEvents: "none",
              zIndex: 100, // Ensure it's above the canvas
            }}
          >
            <div 
              // mix-blend-difference makes it automatically invert color based on background
              className="whitespace-nowrap px-4 py-2 pointer-events-none mix-blend-difference"
              style={{
                transform: 'translate(20px, -20px)', // Offset from the actual cursor tip
              }}
            >
              <h3 className="text-[11px] font-bold tracking-[0.25em] uppercase text-white drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]">
                {entry.title}
              </h3>
            </div>
          </Html>
        )}
      </mesh>
    </group>
  );
}

export function SceneContent({ entries, onSelect }: { entries: GalleryEntry[], onSelect: (e: GalleryEntry) => void }) {
  const scroll = useScroll();
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  const totalCards = entries.length;
  const totalTravelX = totalCards * CONFIG.spacing.x;
  const totalTravelY = totalCards * Math.abs(CONFIG.spacing.y);

  useFrame(() => {
    if (!groupRef.current) return;
    
    const progress = scroll.offset;
    
    // Move left and down as we scroll
    const targetX = -progress * totalTravelX * 1.0; // Adjusted multiplier for wider spacing
    const targetY = -progress * totalTravelY * 1.0; 
    
    groupRef.current.position.x = targetX;
    groupRef.current.position.y = targetY;
  });

  return (
    <group 
      ref={groupRef}
      position={[0, 0, 0]} 
    >
      {entries.map((entry, index) => (
        <GlassCard
          key={`${entry.id}-${index}`}
          entry={entry}
          index={index}
          total={totalCards}
          onSelect={onSelect}
        />
      )).reverse()}
    </group>
  );
}
