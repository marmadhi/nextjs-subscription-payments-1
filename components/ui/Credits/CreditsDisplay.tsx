'use client';

type CreditsDisplayProps = {
  credits: number;
  className?: string;
  showLabel?: boolean;
};

export default function CreditsDisplay({ 
  credits, 
  className = '', 
  showLabel = true 
}: CreditsDisplayProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="bg-blue-600/20 px-3 py-1 rounded-lg flex items-center gap-2">
        <span className="text-blue-400 font-semibold">{credits}</span>
        {showLabel && (
          <span className="text-sm text-blue-300">crédits</span>
        )}
      </div>
    </div>
  );
} 