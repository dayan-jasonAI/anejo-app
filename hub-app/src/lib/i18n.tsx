import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Lightweight EN/ES — mirrors the rest of Añejo's bilingual UX. Persists choice.
type Lang = 'en' | 'es';

const DICT: Record<string, { en: string; es: string }> = {
  studio: { en: 'Creative Studio', es: 'Estudio Creativo' },
  tagline: { en: 'Develop recipes & content with your brand-trained sous-chef', es: 'Desarrolla recetas y contenido con tu sous-chef entrenado en tu marca' },
  greeting: { en: 'What are we creating', es: 'Qué vamos a crear' },
  greetingSub: { en: 'Describe a dish, snap a photo, or pick a starting point.', es: 'Describe un plato, toma una foto o elige un punto de partida.' },
  placeholder: { en: 'Message your sous-chef…', es: 'Escribe a tu sous-chef…' },
  send: { en: 'Send', es: 'Enviar' },
  photo: { en: 'Add photo', es: 'Agregar foto' },
  voice: { en: 'Voice', es: 'Voz' },
  thinking: { en: 'Thinking…', es: 'Pensando…' },
  hint: { en: 'Grounded in your brand brief + kitchen SOPs. Press Enter to send, Shift+Enter for a new line.', es: 'Basado en tu brief de marca + SOPs de cocina. Enter para enviar, Shift+Enter para nueva línea.' },
  you: { en: 'You', es: 'Tú' },
  souschef: { en: 'Sous-chef', es: 'Sous-chef' },
  demoMode: { en: 'Demo mode — not signed in to the HUB. Streaming shown with a sample reply; connect the API for live AI.', es: 'Modo demo — sin sesión del HUB. Streaming con respuesta de muestra; conecta la API para IA real.' },
  // assist types
  guidance: { en: 'Guide me', es: 'Guíame' },
  research: { en: 'Research', es: 'Investigar' },
  substitution: { en: 'Substitute', es: 'Sustituir' },
  scaling: { en: 'Scale', es: 'Escalar' },
  critique: { en: 'Critique', es: 'Crítica' },
  // suggestion chips
  s1: { en: 'A high-protein breakfast bowl under 500 kcal', es: 'Un bowl de desayuno alto en proteína bajo 500 kcal' },
  s2: { en: 'Scale the VIDA bowl to 40 servings', es: 'Escala el bowl VIDA a 40 porciones' },
  s3: { en: 'Substitute shrimp in COCO for a vegan option', es: 'Sustituye el camarón del COCO por opción vegana' },
  s4: { en: 'Write an Instagram caption for today’s special', es: 'Escribe un caption de Instagram para el especial de hoy' },
  // content pipeline
  contentOpen: { en: 'Content', es: 'Contenido' },
  contentTitle: { en: 'One-click content', es: 'Contenido en un clic' },
  contentSub: { en: 'Turn this dish into an on-brand bowl photo, captions, and a menu blurb.', es: 'Convierte este plato en una foto de bowl con tu marca, captions y descripción de menú.' },
  contentNamePh: { en: 'Dish or bowl name (e.g. VIDA)', es: 'Nombre del plato o bowl (ej. VIDA)' },
  contentGenerate: { en: 'Generate content', es: 'Generar contenido' },
  contentGenerating: { en: 'Generating…', es: 'Generando…' },
  contentCaption: { en: 'Social caption', es: 'Caption social' },
  contentBlurb: { en: 'Menu blurb', es: 'Descripción de menú' },
  contentNoImage: { en: 'Image generation isn’t enabled on this environment.', es: 'La generación de imágenes no está habilitada en este entorno.' },
  contentError: { en: 'Couldn’t generate content. Please try again.', es: 'No se pudo generar el contenido. Inténtalo de nuevo.' },
  contentNeedSession: { en: 'Sign in to the HUB to generate content.', es: 'Inicia sesión en el HUB para generar contenido.' },
  copy: { en: 'Copy', es: 'Copiar' },
  copied: { en: 'Copied', es: 'Copiado' },
  close: { en: 'Close', es: 'Cerrar' },
  // photo + voice
  photoAdded: { en: 'Photo added — it’ll be used in your next message.', es: 'Foto agregada — se usará en tu próximo mensaje.' },
  photoError: { en: 'Couldn’t add the photo.', es: 'No se pudo agregar la foto.' },
  voiceRecording: { en: 'Recording… tap 🎙️ to stop', es: 'Grabando… toca 🎙️ para detener' },
  voiceTranscribing: { en: 'Transcribing…', es: 'Transcribiendo…' },
  voiceUnavailable: { en: 'Voice transcription isn’t enabled here.', es: 'La transcripción de voz no está habilitada aquí.' },
  voiceDenied: { en: 'Microphone permission denied.', es: 'Permiso de micrófono denegado.' },
  // recipe draft → publish
  recipeOpen: { en: 'Recipe', es: 'Receta' },
  recipeTitle: { en: 'Draft & publish recipe', es: 'Borrador y publicar receta' },
  recipeSub: { en: 'Turn this session into a saved recipe in your kitchen library.', es: 'Convierte esta sesión en una receta guardada en tu biblioteca de cocina.' },
  recipeDraft: { en: 'Draft from session', es: 'Borrador desde la sesión' },
  recipeDrafting: { en: 'Drafting…', es: 'Generando…' },
  recipeName: { en: 'Recipe name', es: 'Nombre de la receta' },
  recipeIngredients: { en: 'Ingredients', es: 'Ingredientes' },
  recipeSteps: { en: 'Steps', es: 'Pasos' },
  recipePublish: { en: 'Publish to Library', es: 'Publicar en Biblioteca' },
  recipePublishing: { en: 'Publishing…', es: 'Publicando…' },
  recipePublished: { en: 'Published to your library!', es: '¡Publicado en tu biblioteca!' },
  recipeError: { en: 'Couldn’t draft a recipe. Please try again.', es: 'No se pudo generar la receta. Inténtalo de nuevo.' },
  openLibrary: { en: 'Open Library', es: 'Abrir Biblioteca' },
};

interface I18nCtx { lang: Lang; t: (k: string) => string; toggle: () => void; }
const Ctx = createContext<I18nCtx>({ lang: 'en', t: (k) => k, toggle: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('anejo:lang') === 'es' ? 'es' : 'en'));
  const t = useCallback((k: string) => DICT[k]?.[lang] ?? k, [lang]);
  const toggle = useCallback(() => {
    setLang((l) => {
      const next = l === 'en' ? 'es' : 'en';
      localStorage.setItem('anejo:lang', next);
      return next;
    });
  }, []);
  return <Ctx.Provider value={{ lang, t, toggle }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
