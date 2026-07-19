interface JourneyStep {
  label: string;
  description: string;
}

interface JourneyStepsProps {
  steps: JourneyStep[];
  current: number;
  label?: string;
}

export function JourneySteps({ steps, current, label = 'Etapas da jornada' }: JourneyStepsProps) {
  return (
    <nav aria-label={label} className="journey-steps">
      <ol>
        {steps.map((step, index) => {
          const number = index + 1;
          const state = number < current ? 'complete' : number === current ? 'current' : 'future';
          return (
            <li className={`journey-step journey-step-${state}`} key={step.label}>
              <span className="journey-step-number" aria-hidden="true">
                {state === 'complete' ? '✓' : number}
              </span>
              <span>
                <strong {...(state === 'current' ? { 'aria-current': 'step' as const } : {})}>
                  {step.label}
                </strong>
                <small>{step.description}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
