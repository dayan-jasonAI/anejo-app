# Spectrum UI access

Non-React app: Spectrum UI React components are not directly compatible. Keep the existing framework; GSAP remains available for animations.

Local source: `/Users/aiagent/Dayan Workspace/spectrum-ui`
Upstream: https://github.com/arihantcodes/spectrum-ui
Docs: https://ui.spectrumhq.in/docs
Registry: https://ui.spectrumhq.in/r/{name}.json

In a configured shadcn app: `npx shadcn@latest add @spectrumui/<component>`. Inspect source and dependency requirements first. Add only requested components, preserve existing files, branding and accessibility, and validate build and browser behavior. No components have been copied by this setup.
