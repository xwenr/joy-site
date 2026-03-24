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

// ---------------------------------------------------------------------------
// Responsive layout metrics – every spatial value derives from viewport so
// card sizes, spacing, hover distances and timeline positions scale in
// lockstep.  A "compact" breakpoint (narrow window) disables hover-pullout
// and thins out timeline labels to prevent overlap.
// ---------------------------------------------------------------------------

interface LayoutMetrics {
  spacing: { x: number; y: number; z: number };
  cardHeightRatio: number;
  hoverPullout: number;
  timelineOffsetY: number;
  timelineDotRadius: number;
  timelineLabelOffsetY: number;
  timelineLineRadius: number;
  hoverTextOffsetPx: number;
  isCompact: boolean;
  timelineLabelStep: number;
}

function useLayoutMetrics(viewport: { width: number; height: number }): LayoutMetrics {
  return useMemo(() => {
    const vw = viewport.width;
    const vh = viewport.height;

    // ~800 px at camera zoom 100
    const isCompact = vw < 8;

    // Base spatial unit tied to viewport height – keeps every gap proportional
    const baseUnit = vh * 0.14;

    return {
      spacing: {
        x: baseUnit,
        y: baseUnit * 0.3,
        z: -0.05,
      },
      cardHeightRatio: 0.42,
      hoverPullout: isCompact ? 0 : baseUnit * 0.83,
      timelineOffsetY: -(vh * 0.074),
      timelineDotRadius: vh * 0.0028,
      timelineLabelOffsetY: -(vh * 0.014),
      timelineLineRadius: vh * 0.00046,
      hoverTextOffsetPx: Math.max(10, Math.min(20, vw * 1.5)),
      isCompact,
      timelineLabelStep: isCompact ? 2 : 1,
    };
  }, [viewport.width, viewport.height]);
}

interface GlassCardProps {
  entry: GalleryEntry;
  index: number;
  total: number;
  onSelect: (entry: GalleryEntry) => void;
  metrics: LayoutMetrics;
}

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

export function GlassCard({ entry, index, total, onSelect, metrics }: GlassCardProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const topFaceMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const rightFaceMatRef = useRef<THREE.MeshBasicMaterial>(null);
  
  const [hovered, setHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [targetMousePos, setTargetMousePos] = useState({ x: 0, y: 0 });

  const { viewport } = useThree();
  
  const texture = useTexture(entry.image);
  texture.colorSpace = THREE.SRGBColorSpace;
  const textureImage = texture.image;
  
  const baseX = index * metrics.spacing.x;
  const baseY = index * metrics.spacing.y;
  const baseZ = index * metrics.spacing.z;

  const imageAspect = hasImageDimensions(textureImage)
    ? textureImage.width / textureImage.height
    : 4 / 3;

  const height = viewport.height * metrics.cardHeightRatio;
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

    const targetX = baseX + (hovered ? metrics.hoverPullout : 0);
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

        {hovered && (
          <Html
            position={[mousePos.x, mousePos.y, 0.01]} 
            center
            style={{
              pointerEvents: "none",
              zIndex: 100,
            }}
          >
            <div 
              className="whitespace-nowrap px-4 py-2 pointer-events-none mix-blend-difference"
              style={{
                transform: `translate(${metrics.hoverTextOffsetPx}px, -${metrics.hoverTextOffsetPx}px)`,
              }}
            >
              <h3 className="text-[11px] font-bold tracking-[0.25em] uppercase text-white drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]">
                {entry.channel === "archive" && entry.archiveType
                  ? `${entry.archiveType} — ${entry.title}`
                  : `${entry.date.replace(/-/g, ".")} — ${entry.title}`}
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
  const metrics = useLayoutMetrics(viewport);

  const totalCards = entries.length;
  const totalTravelX = totalCards * metrics.spacing.x;
  const totalTravelY = totalCards * Math.abs(metrics.spacing.y);

  const isLifeChannel = entries.length > 0 && entries.every(e => e.channel === "life");
  
  const timelineNodes = useMemo(() => {
    if (!isLifeChannel) return [];
    
    const nodes: { month: string; position: [number, number, number] }[] = [];
    let lastMonth = "";
    
    const reversedEntries = [...entries].reverse();
    
    reversedEntries.forEach((entry, index) => {
      if (entry.timelineMonth && entry.timelineMonth !== lastMonth) {
        nodes.push({
          month: entry.timelineMonth.replace("-", "."),
          position: [
            index * metrics.spacing.x,
            index * metrics.spacing.y,
            index * metrics.spacing.z
          ]
        });
        lastMonth = entry.timelineMonth;
      }
    });
    return nodes;
  }, [entries, isLifeChannel, metrics.spacing]);

  useFrame(() => {
    if (!groupRef.current) return;
    
    const progress = scroll.offset;
    
    groupRef.current.position.x = -progress * totalTravelX;
    groupRef.current.position.y = -progress * totalTravelY;
  });

  const tlOffY = metrics.timelineOffsetY;
  const lineStart: [number, number, number] = [0, tlOffY, 0];
  const lineEnd: [number, number, number] = [
    (totalCards - 1) * metrics.spacing.x,
    (totalCards - 1) * metrics.spacing.y + tlOffY,
    (totalCards - 1) * metrics.spacing.z
  ];

  const visibleTimelineNodes = metrics.timelineLabelStep > 1
    ? timelineNodes.filter((_, i) => i % metrics.timelineLabelStep === 0)
    : timelineNodes;

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
          metrics={metrics}
        />
      )).reverse()}

      {isLifeChannel && timelineNodes.length > 0 && (
        <group position={[0, 0, -0.1]}>
          <mesh>
            <tubeGeometry args={[
              new THREE.LineCurve3(
                new THREE.Vector3(...lineStart),
                new THREE.Vector3(...lineEnd)
              ),
              64,
              metrics.timelineLineRadius,
              8,
              false
            ]} />
            <meshBasicMaterial color="#d0d0d0" transparent opacity={0.3} />
          </mesh>

          {visibleTimelineNodes.map((node, i) => (
            <group key={i} position={[node.position[0], node.position[1] + tlOffY, node.position[2]]}>
              <mesh>
                <circleGeometry args={[metrics.timelineDotRadius, 32]} />
                <meshBasicMaterial color="#111" />
              </mesh>
              
              <Html
                position={[0, metrics.timelineLabelOffsetY, 0]}
                center
                style={{ pointerEvents: "none" }}
              >
                <div className="text-[10px] font-medium tracking-widest text-[#111]/40 whitespace-nowrap">
                  {node.month}
                </div>
              </Html>
            </group>
          ))}
        </group>
      )}
    </group>
  );
}
