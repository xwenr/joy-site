"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { useTexture, Html, useScroll, Text } from "@react-three/drei";
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

// Timeline line shader – fades alpha toward viewport edges so only
// the portion near the screen center is visible.
const timelineLineVert = `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const timelineLineFrag = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFadeRange;
  varying vec3 vWorldPos;
  void main() {
    float d = abs(vWorldPos.x);
    float fade = 1.0 - smoothstep(uFadeRange * 0.4, uFadeRange, d);
    gl_FragColor = vec4(uColor, uOpacity * fade);
  }
`;

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

interface LayoutMetrics {
  spacing: { x: number; y: number; z: number };
  cardHeightRatio: number;
  hoverPullout: number;
  startOffsetY: number;
  timelineOffsetY: number;
  timelineDotRadius: number;
  timelineLabelOffsetY: number;
  timelineLineRadius: number;
  hoverTextOffsetPx: number;
  isCompact: boolean;
  isMobile: boolean;
  timelineLabelStep: number;
}

function useLayoutMetrics(viewport: { width: number; height: number }): LayoutMetrics {
  return useMemo(() => {
    const vw = viewport.width;
    const vh = viewport.height;

    const isMobile = vw < 5;
    const isCompact = vw < 8;

    const baseUnit = vh * (isMobile ? 0.26 : 0.205);

    return {
      spacing: {
        x: baseUnit * (isMobile ? 0.85 : 1),
        y: baseUnit * (isMobile ? 0.08 : 0.3),
        z: -0.05,
      },
      cardHeightRatio: isMobile ? 0.34 : 0.42,
      hoverPullout: isCompact ? 0 : baseUnit * 0.75,
      startOffsetY: isMobile ? -vh * 0.12 : 0,
      timelineOffsetY: vh * (isMobile ? 0.42 : 0.37),
      timelineDotRadius: vh * 0.004,
      timelineLabelOffsetY: vh * 0.02,
      timelineLineRadius: vh * 0.001,
      hoverTextOffsetPx: Math.max(10, Math.min(20, vw * 1.5)),
      isCompact,
      isMobile,
      timelineLabelStep: isMobile ? 3 : isCompact ? 2 : 1,
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
  const [tapped, setTapped] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [targetMousePos, setTargetMousePos] = useState({ x: 0, y: 0 });
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { viewport } = useThree();

  const active = hovered || tapped;
  
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

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    setTargetMousePos({
      x: e.point.x - baseX,
      y: e.point.y - baseY,
    });
  };

  useFrame((_state, delta) => {
    if (!groupRef.current || !materialRef.current) return;

    const targetX = baseX + (active ? metrics.hoverPullout : 0);
    groupRef.current.position.x = THREE.MathUtils.damp(
      groupRef.current.position.x,
      targetX,
      6,
      delta
    );

    materialRef.current.uniforms.uHover.value = THREE.MathUtils.damp(
      materialRef.current.uniforms.uHover.value,
      active ? 1.0 : 0.0,
      6,
      delta
    );

    if (topFaceMatRef.current) {
      topFaceMatRef.current.opacity = THREE.MathUtils.damp(
        topFaceMatRef.current.opacity,
        active ? 0.24 : 0.2,
        6,
        delta
      );
    }

    if (rightFaceMatRef.current) {
      rightFaceMatRef.current.opacity = THREE.MathUtils.damp(
        rightFaceMatRef.current.opacity,
        active ? 0.3 : 0.26,
        6,
        delta
      );
    }

    if (active && !metrics.isMobile) {
      setMousePos({
        x: THREE.MathUtils.damp(mousePos.x, targetMousePos.x, 8, delta),
        y: THREE.MathUtils.damp(mousePos.y, targetMousePos.y, 8, delta),
      });
    }
  });

  const labelText = entry.channel === "archive" && entry.archiveType
    ? `${entry.archiveType} — ${entry.title}`
    : `${entry.date.replace(/-/g, ".")} — ${entry.title}`;

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
          if (metrics.isMobile) return;
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
          handlePointerMove(e);
        }}
        onPointerMove={(e) => {
          if (metrics.isMobile) return;
          handlePointerMove(e);
        }}
        onPointerOut={(e) => {
          if (metrics.isMobile) return;
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (metrics.isMobile) {
            if (tapped) {
              if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
              setTapped(false);
              onSelect(entry);
            } else {
              setTapped(true);
              tapTimerRef.current = setTimeout(() => setTapped(false), 2500);
            }
          } else {
            onSelect(entry);
          }
        }}
      >
        <planeGeometry args={[width, height, 32, 32]} />
        
        <shaderMaterial
          ref={materialRef}
          vertexShader={SkewCardMaterial.vertexShader}
          fragmentShader={SkewCardMaterial.fragmentShader}
          uniforms={uniforms}
          transparent={true}
          depthWrite={false}
        />

        {active && !metrics.isMobile && (
          <Html
            position={[mousePos.x, mousePos.y, 0.01]} 
            center
            style={{ pointerEvents: "none", zIndex: 100 }}
          >
            <div 
              className="whitespace-nowrap px-4 py-2 pointer-events-none mix-blend-difference"
              style={{
                transform: `translate(${metrics.hoverTextOffsetPx}px, -${metrics.hoverTextOffsetPx}px)`,
              }}
            >
              <h3 className="text-[11px] font-bold tracking-[0.25em] uppercase text-white drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]">
                {labelText}
              </h3>
            </div>
          </Html>
        )}

        {tapped && metrics.isMobile && (
          <Html
            position={[0, -height / 2 - 0.15, 0.01]}
            center
            style={{ pointerEvents: "none", zIndex: 100 }}
          >
            <div className="whitespace-nowrap px-3 py-1.5 pointer-events-none">
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-fg/80 text-center">
                {labelText}
              </p>
              <p className="text-[9px] tracking-[0.15em] uppercase text-fg/40 text-center mt-0.5">
                Tap again to open
              </p>
            </div>
          </Html>
        )}
      </mesh>
    </group>
  );
}

function useIsDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return dark;
}

export function SceneContent({ entries, onSelect }: { entries: GalleryEntry[], onSelect: (e: GalleryEntry) => void }) {
  const scroll = useScroll();
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();
  const metrics = useLayoutMetrics(viewport);
  const isDark = useIsDarkMode();

  const totalCards = entries.length;
  const totalTravelX = totalCards * metrics.spacing.x;
  const totalTravelY = totalCards * Math.abs(metrics.spacing.y);

  const isLifeChannel = entries.length > 0 && entries.every(e => e.channel === "life");

  const tlColor = isDark ? "#666" : "#111";

  const timelineLineMat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(tlColor) },
      uOpacity: { value: 0.7 },
      uFadeRange: { value: viewport.width / 2 },
    },
    vertexShader: timelineLineVert,
    fragmentShader: timelineLineFrag,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tlColor]);

  const timelineNodes = useMemo(() => {
    if (!isLifeChannel) return [];
    
    const nodes: { month: string; position: [number, number, number] }[] = [];
    let lastMonth = "";
    
    entries.forEach((entry, index) => {
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

  useFrame((state) => {
    if (!groupRef.current) return;
    
    const progress = scroll.offset;
    
    groupRef.current.position.x = -progress * totalTravelX;
    groupRef.current.position.y = metrics.startOffsetY - progress * totalTravelY;

    timelineLineMat.uniforms.uFadeRange.value = state.viewport.width / 2;
  });

  const tlOffY = metrics.timelineOffsetY;
  const pad = metrics.spacing.x;
  const slope = metrics.spacing.y / metrics.spacing.x;
  const lineStart: [number, number, number] = [
    -pad,
    tlOffY - pad * slope,
    0
  ];
  const lastNode = timelineNodes[timelineNodes.length - 1];
  const lineEndX = lastNode ? lastNode.position[0] : 0;
  const lineEnd: [number, number, number] = [
    lineEndX,
    lineEndX * slope + tlOffY,
    lastNode ? lastNode.position[2] : 0
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
          <mesh material={timelineLineMat}>
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
          </mesh>

          {visibleTimelineNodes.map((node, i) => (
            <group key={i} position={[node.position[0], node.position[1] + tlOffY, node.position[2]]}>
              <mesh frustumCulled={false}>
                <circleGeometry args={[metrics.timelineDotRadius, 32]} />
                <meshBasicMaterial color={tlColor} />
              </mesh>
              <Text
                position={[0, metrics.timelineLabelOffsetY, 0.01]}
                fontSize={viewport.height * (metrics.isMobile ? 0.01 : 0.012)}
                color={tlColor}
                anchorX="center"
                anchorY="middle"
                letterSpacing={0.15}
                frustumCulled={false}
              >
                {node.month}
              </Text>
            </group>
          ))}
        </group>
      )}
    </group>
  );
}
