'use client';

import React, { useEffect, useRef } from 'react';

type ProceduralGroundBackgroundProps = {
  teamColor?: string;
  accentColor?: string;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '');
  const value = clean.length === 3
    ? clean
        .split('')
        .map((c) => `${c}${c}`)
        .join('')
    : clean;

  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return [r, g, b];
};

const ProceduralGroundBackground: React.FC<ProceduralGroundBackgroundProps> = ({
  teamColor = '#FFF100',
  accentColor = '#000000',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision highp float;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec3 u_teamColor;
      uniform vec3 u_accentColor;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);

        float depth = 1.0 / (uv.y + 1.15);
        vec2 gridUv = vec2(uv.x * depth, depth + u_time * 0.15);

        float n = noise(gridUv * 3.5);
        float ripples = sin(gridUv.y * 18.0 + n * 8.0 + u_time * 0.5);
        float topoLine = smoothstep(0.03, 0.0, abs(ripples));

        vec3 baseColor = vec3(0.04, 0.03, 0.12);
        vec3 accentColor = mix(vec3(0.08, 0.18, 0.35), u_teamColor, 0.65);
        vec3 neonColor = mix(u_teamColor, u_accentColor, 0.28);

        vec3 finalColor = mix(baseColor, accentColor, n * 0.6);
        finalColor += topoLine * neonColor * depth * 0.45;

        float fade = smoothstep(0.1, -1.0, uv.y);
        finalColor *= (1.0 - length(uv) * 0.45) * (1.0 - fade);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posAttrib = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posAttrib);
    gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);

    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const teamColorLoc = gl.getUniformLocation(program, 'u_teamColor');
    const accentColorLoc = gl.getUniformLocation(program, 'u_accentColor');

    const [tr, tg, tb] = hexToRgb(teamColor);
    const [ar, ag, ab] = hexToRgb(accentColor);

    if (teamColorLoc) gl.uniform3f(teamColorLoc, tr, tg, tb);
    if (accentColorLoc) gl.uniform3f(accentColorLoc, ar, ag, ab);

    let animationFrameId = 0;
    const render = (time: number) => {
      const { innerWidth: width, innerHeight: height } = window;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }

      if (timeLoc) gl.uniform1f(timeLoc, time * 0.001);
      if (resLoc) gl.uniform2f(resLoc, width, height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [teamColor, accentColor]);

  return (
    <div className="fixed inset-0 w-full h-full bg-zinc-950 z-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full block touch-none"
        style={{ filter: 'contrast(1.1) brightness(0.9)' }}
      />
    </div>
  );
};

export default ProceduralGroundBackground;
