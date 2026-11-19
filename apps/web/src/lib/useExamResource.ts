import { useCallback, useEffect, useState } from "react";
import { apiRequest, type ApiError } from "./api";

/** La clave incluye token y URL: una respuesta anterior nunca cruza contexto o filtros. */
export function useExamResource<T>(path: string | null, token: string) {
  const [revision, setRevision] = useState(0);
  const key = `${token}:${path}:${revision}`;
  const [state, setState] = useState<{ key: string; data: T | null; error: Error | null; loading: boolean }>({ key: "", data: null, error: null, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (path) {
      apiRequest<T>(path, { token, signal: controller.signal }).then(data => {
        if (active) setState({ key, data, error: null, loading: false });
      }).catch((error: ApiError) => {
        if (active) setState({ key, data: null, error, loading: false });
      });
    }
    return () => { active = false; controller.abort(); };
  }, [key, path, token]);
  return {
    ...(state.key === key ? state : { data: null, error: null, loading: !!path }),
    reload: useCallback(() => setRevision(value => value + 1), []),
  };
}
