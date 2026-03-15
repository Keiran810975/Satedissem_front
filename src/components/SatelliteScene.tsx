import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Text, Float, Line } from '@react-three/drei';
import * as THREE from 'three';
import { NodeData, LinkData, Transmission } from '../types';

interface NodeProps {
  data: NodeData;
  totalShards: number;
}

const SatelliteNode: React.FC<NodeProps> = ({ data, totalShards }) => {
  const progress = data.shards.size / totalShards;
  const color = data.type === 'station' ? '#10b981' : progress === 1 ? '#3b82f6' : '#6366f1';
  const size = data.type === 'station' ? 0.6 : 0.4;

  return (
    <group position={data.position}>
      <mesh>
        <sphereGeometry args={[size, 32, 32]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={0.5} 
          roughness={0.2} 
          metalness={0.8}
        />
      </mesh>
      
      {/* Progress Ring */}
      {data.type === 'satellite' && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[size + 0.1, size + 0.2, 32, 1, 0, Math.PI * 2 * progress]} />
          <meshBasicMaterial color="#3b82f6" side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      )}

      <Text
        position={[0, size + 0.5, 0]}
        fontSize={0.3}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {data.type === 'station' ? 'Base Station' : `Sat ${data.id}`}
      </Text>
      
      {data.type === 'satellite' && (
        <Text
          position={[0, -size - 0.4, 0]}
          fontSize={0.2}
          color="#94a3b8"
          anchorX="center"
          anchorY="middle"
        >
          {data.shards.size}/{totalShards}
        </Text>
      )}
    </group>
  );
};

interface LinkProps {
  from: [number, number, number];
  to: [number, number, number];
  active: boolean;
}

const LinkLine: React.FC<LinkProps> = ({ from, to, active }) => {
  if (!active) return null;
  
  return (
    <Line
      points={[from, to]}
      color="#475569"
      lineWidth={1}
      transparent
      opacity={0.3}
    />
  );
};

const Packet: React.FC<{ transmission: Transmission; nodes: NodeData[]; currentTime: number }> = ({ 
  transmission, 
  nodes, 
  currentTime 
}) => {
  const fromNode = nodes.find(n => n.id === transmission.fromId);
  const toNode = nodes.find(n => n.id === transmission.toId);
  
  if (!fromNode || !toNode) return null;

  const t = (currentTime - transmission.startTime) / transmission.duration;
  const clampedT = Math.max(0, Math.min(1, t));
  
  const pos = new THREE.Vector3().lerpVectors(
    new THREE.Vector3(...fromNode.position),
    new THREE.Vector3(...toNode.position),
    clampedT
  );

  return (
    <mesh position={[pos.x, pos.y, pos.z]}>
      <sphereGeometry args={[0.15, 16, 16]} />
      <meshBasicMaterial color="#fbbf24" />
      <pointLight color="#fbbf24" intensity={0.5} distance={2} />
    </mesh>
  );
};

interface SceneProps {
  nodes: NodeData[];
  links: LinkData[];
  transmissions: Transmission[];
  currentTime: number;
  totalShards: number;
}

export const SatelliteScene: React.FC<SceneProps> = ({ 
  nodes, 
  links, 
  transmissions, 
  currentTime,
  totalShards
}) => {
  return (
    <div className="w-full h-full bg-[#020617]">
      <Canvas camera={{ position: [20, 20, 20], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        <group>
          {links.map((link, idx) => {
            const fromNode = nodes.find(n => n.id === link.from);
            const toNode = nodes.find(n => n.id === link.to);
            const isActive = link.intervals.some(([start, end]) => currentTime >= start && currentTime <= end);
            
            if (!fromNode || !toNode) return null;
            
            return (
              <LinkLine 
                key={`link-${idx}`} 
                from={fromNode.position} 
                to={toNode.position} 
                active={isActive} 
              />
            );
          })}

          {nodes.map(node => (
            <SatelliteNode key={node.id} data={node} totalShards={totalShards} />
          ))}

          {transmissions.map(tx => (
            <Packet 
              key={tx.id} 
              transmission={tx} 
              nodes={nodes} 
              currentTime={currentTime} 
            />
          ))}
        </group>

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
};
