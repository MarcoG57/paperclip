# Evidence-first company: implementación del fork

Este cambio aplica un perfil de trabajo dentro de Paperclip sin sustituir sus servicios.

- La autoría, arquitectura, operación y estado están en [company/README.md](../../company/README.md).
- El análisis de subsistemas y diferencias respecto al blueprint anterior está en [company/AUDIT.md](../../company/AUDIT.md).
- Los pendientes de runtime y mejoras medibles están en [company/ROADMAP.md](../../company/ROADMAP.md).

Decisiones: catálogo opcional; imports pausados; tipo de adapter declarado preservado; preview ligado a hash; defaults Codex sin bypass; herramientas operativas pequeñas; datos privados fuera del fork. No cambiar estructura upstream, licencias, datos de instancias ni configuración global personal.

No se considera la auditoría completa de todo el código ni una validación de producción. Los tests nativos y CI del commit son la evidencia; los gates de host/modelos permanecen pendientes.
