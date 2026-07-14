import type { ResearchStage } from "../types";

interface Step {
  key: ResearchStage;
  label: string;
}

interface FlowStepperProps {
  steps: Step[];
  current: ResearchStage;
  onStepClick: (stage: ResearchStage) => void;
}

export default function FlowStepper({
  steps,
  current,
  onStepClick,
}: FlowStepperProps) {
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <nav className="space-y-1">
      {steps.map((step, index) => {
        const isActive = step.key === current;
        const isCompleted = index < currentIndex;

        return (
          <button
            key={step.key}
            onClick={() => onStepClick(step.key)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive
                ? "bg-primary-50 text-primary-700 font-medium"
                : isCompleted
                ? "text-green-600 hover:bg-gray-50"
                : "text-gray-400 hover:bg-gray-50"
            }`}
          >
            <span className="inline-block w-5 text-xs">
              {isCompleted ? "✓" : index + 1}
            </span>
            {step.label}
          </button>
        );
      })}
    </nav>
  );
}
