'use client';

interface ExecutionModeIndicatorProps {
  mode: 'SIMULATED' | 'PAPER' | 'BROKER_SANDBOX' | 'LIVE';
  className?: string;
}

export function ExecutionModeIndicator({ mode, className = '' }: ExecutionModeIndicatorProps) {
  const modeConfig = {
    SIMULATED: {
      label: 'SIMULATED MODE',
      description: 'Paper trading with simulated market data',
      bgColor: 'bg-blue-600',
      textColor: 'text-blue-100',
      borderColor: 'border-blue-500',
      icon: '🎮',
    },
    PAPER: {
      label: 'PAPER MODE',
      description: 'Practice trading with real market data',
      bgColor: 'bg-yellow-600',
      textColor: 'text-yellow-100',
      borderColor: 'border-yellow-500',
      icon: '📝',
    },
    BROKER_SANDBOX: {
      label: 'BROKER SANDBOX',
      description: 'Testing with broker sandbox environment',
      bgColor: 'bg-purple-600',
      textColor: 'text-purple-100',
      borderColor: 'border-purple-500',
      icon: '🧪',
    },
    LIVE: {
      label: 'LIVE TRADING',
      description: 'Real money trading - BE CAREFUL!',
      bgColor: 'bg-red-600',
      textColor: 'text-red-100',
      borderColor: 'border-red-500',
      icon: '⚠️',
    },
  };

  const config = modeConfig[mode];

  return (
    <div className={`${config.bgColor} ${config.textColor} border ${config.borderColor} rounded-lg p-3 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-2xl" aria-hidden="true">
          {config.icon}
        </span>
        <div className="flex-1">
          <div className="font-bold text-sm tracking-wide">{config.label}</div>
          <div className="text-xs opacity-90 mt-0.5">{config.description}</div>
        </div>
      </div>
      
      {mode !== 'LIVE' && (
        <div className="mt-2 pt-2 border-t border-current border-opacity-20 text-xs">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>No real money at risk - All trades are simulated</span>
          </div>
        </div>
      )}
      
      {mode === 'LIVE' && (
        <div className="mt-2 pt-2 border-t border-current border-opacity-20 text-xs font-semibold">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>REAL MONEY TRADING - Use caution!</span>
          </div>
        </div>
      )}
    </div>
  );
}
