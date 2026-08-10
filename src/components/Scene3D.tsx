import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import { useMemo } from 'react';

export interface SceneDevice {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  type: 'master' | 'client' | 'target' | 'other';
  rssi?: number;
}

function Node({ device, onSelect }: { device: SceneDevice; onSelect: (id: string) => void }) {
  const color =
    device.type === 'master' ? '#F59E0B' :
    device.type === 'client' ? '#10B981' :
    device.type === 'target' ? '#EF4444' : '#9CA3AF';
  const scale = device.type === 'master' ? 1.4 : 1.0;

  return (
    <mesh position={[device.x, device.y, device.z]} scale={scale} onClick={() => onSelect(device.id)}>
      <sphereGeometry args={[0.35, 32, 32]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} roughness={0.2} metalness={0.6} />
    </mesh>
  );
}


export default function Scene3D({ devices, onSelect }: { devices: SceneDevice[]; onSelect: (id: string) => void }) {
  const master = devices.find(d => d.type === 'master');
  const clients = devices.filter(d => d.type === 'client');
  const targets = devices.filter(d => d.type === 'target');

  // Linien vom Master zu gebundenen Client/Target Geräten
  const connectionPoints = useMemo(() => {
    const pts: [number, number, number][] = [];
    if (master) {
      clients.concat(targets).forEach(d => {
        pts.push([master.x, master.y, master.z]);
        pts.push([d.x, d.y, d.z]);
      });
    }
    return pts;
  }, [master, clients, targets]);

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-[#020617] via-[#060f2a] to-[#020617] overflow-hidden">
      <Canvas camera={{ position: [5, 4, 7], fov: 45 }} gl={{ antialias: true, alpha: false }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 5, 5]} intensity={1.0} castShadow />
        <pointLight position={[-4, 3, -4]} intensity={1.2} color="#38bdf8" />
        
        <color attach="background" args={['#020617']} />
        <fog attach="fog" args={['#020617', 8, 22]} />

        {/* Grid floor */}
        <gridHelper args={[24, 24, '#334155', '#1e293b']} position={[0, -1.5, 0]} />

        {devices.map(d => (
          <Node key={d.id} device={d} onSelect={onSelect} />
        ))}

        {connectionPoints.length > 0 && (
          <Line points={connectionPoints} color="#38bdf8" lineWidth={1.5} transparent opacity={0.6} />
        )}

        <OrbitControls enablePan={true} enableZoom={true} autoRotate autoRotateSpeed={0.5} />
      </Canvas>
      <div className="absolute top-3 left-3 bg-slate-900/70 backdrop-blur-md border border-slate-700/60 rounded-xl px-3 py-2 text-xs font-mono text-cyan-200 shadow-2xl shadow-cyan-900/10 pointer-events-none">
        <div className="flex gap-4">
          <span>Master <span className="text-amber-400">●</span></span>
          <span>Client <span className="text-emerald-400">●</span></span>
          <span>Target <span className="text-rose-400">●</span></span>
          <span>Andere <span className="text-slate-400">●</span></span>
        </div>
      </div>
    </div>
  );
}
