interface SyncProgressShowcaseProps {
  current: number;
  total: number;
  percentage: number;
  description: string;
  accountNickname: string;
}

export function SyncProgressShowcase({
  current,
  total,
  percentage,
  description,
  accountNickname,
}: SyncProgressShowcaseProps) {
  return (
    <div
      className={`rounded-lg border-2 p-4 transition-all bg-orange-50 border-orange-300`}
    >
      {/* Header do card */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-orange-500`}
          >
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {accountNickname}
            </p>
            <p className="text-xs text-gray-600">{description}</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-gray-700">
          {current}/{total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-300 bg-orange-500`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 text-right">{percentage}%</p>
      </div>
    </div>
  );
}
