
"use client";
import React from "react";

interface FolderProps {
  color?: string;
  size?: number;
  className?: string;
}

const darkenColor = (hex: string, percent: number): string => {
  let color = hex.startsWith("#") ? hex.slice(1) : hex;
  if (color.length === 3) {
    color = color
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(color, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.min(255, Math.floor(r * (1 - percent))));
  g = Math.max(0, Math.min(255, Math.floor(g * (1 - percent))));
  b = Math.max(0, Math.min(255, Math.floor(b * (1 - percent))));
  return (
    "#" +
    ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
  );
};

const Folder: React.FC<FolderProps> = ({
  color = "#5227FF",
  size = 1,
  className = "",
}) => {
  const folderBackColor = darkenColor(color, 0.08);
  const paper1 = darkenColor("#ffffff", 0.1);
  const paper2 = darkenColor("#ffffff", 0.05);
  const paper3 = "#ffffff";

  const folderStyle: React.CSSProperties = {
    "--folder-color": color,
    "--folder-back-color": folderBackColor,
    "--paper-1": paper1,
    "--paper-2": paper2,
    "--paper-3": paper3,
  } as React.CSSProperties;

  const scaleStyle = { transform: `scale(${size})` };

  return (
    <div style={scaleStyle} className={className}>
      <div
        className="group relative transition-all duration-200 ease-in cursor-pointer hover:-translate-y-2"
        style={folderStyle}
      >
        <div
          className="relative w-[80px] h-[64px] rounded-tl-0 rounded-tr-[8px] rounded-br-[8px] rounded-bl-[8px]"
          style={{ backgroundColor: folderBackColor }}
        >
          <span
            className="absolute z-0 bottom-[98%] left-0 w-[24px] h-[8px] rounded-tl-[4px] rounded-tr-[4px] rounded-bl-0 rounded-br-0"
            style={{ backgroundColor: folderBackColor }}
          ></span>
          <div
            className="absolute z-20 bottom-[10%] left-1/2 w-[70%] h-[80%] transform -translate-x-1/2 translate-y-[10%] group-hover:translate-y-0 transition-all duration-300 ease-in-out"
            style={{
              backgroundColor: "var(--paper-1)",
              borderRadius: "8px",
            }}
          ></div>
          <div
            className="absolute z-20 bottom-[10%] left-1/2 w-[80%] h-[70%] transform -translate-x-1/2 translate-y-[10%] group-hover:translate-y-0 transition-all duration-300 ease-in-out"
            style={{
              backgroundColor: "var(--paper-2)",
              borderRadius: "8px",
            }}
          ></div>
          <div
            className="absolute z-20 bottom-[10%] left-1/2 w-[90%] h-[60%] transform -translate-x-1/2 translate-y-[10%] group-hover:translate-y-0 transition-all duration-300 ease-in-out"
            style={{
              backgroundColor: "var(--paper-3)",
              borderRadius: "8px",
            }}
          ></div>
          <div
            className="absolute z-30 w-full h-full origin-bottom group-hover:[transform:skew(15deg)_scaleY(0.6)] transition-all duration-300 ease-in-out"
            style={{
              backgroundColor: "var(--folder-color)",
              borderRadius: "4px 8px 8px 8px",
            }}
          ></div>
          <div
            className="absolute z-30 w-full h-full origin-bottom group-hover:[transform:skew(-15deg)_scaleY(0.6)] transition-all duration-300 ease-in-out"
            style={{
              backgroundColor: "var(--folder-color)",
              borderRadius: "4px 8px 8px 8px",
            }}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default Folder;
