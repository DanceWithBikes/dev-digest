import { OnboardingTourView } from "./_components/OnboardingTourView";

/* Route: /repos/:repoId/onboarding (Onboarding Tour). Thin route entry — the header,
   table of contents, banners and the five sections live under _components/OnboardingTourView. */
export default function OnboardingTourPage() {
  return <OnboardingTourView />;
}
