import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { SelectField } from "./ui/SelectField";
import { FormBanner } from "./ui/FormBanner";
import { ApiError, type ExamType } from "../lib/api";
import { localToday, prepareUpload, sendPreparedUpload, validClinicalDate, type PreparedUpload } from "../lib/exams";
import { useAuth } from "../context/AuthContext";

type Props = {
  token: string; clinicId: string; patientId: string; examTypes: ExamType[]; examId?: string;
  canWrite?: boolean; onPermissionDenied?: () => Promise<unknown>;
  onDone: () => void; onCancel: () => void;
};
const LEAVE_WARNING = "Hay una carga en curso o sin confirmación. Puede haberse recibido en el servidor. Al salir perderás el reintento con la misma operación. ¿Quieres salir?";
const MESSAGES: Record<number, string> = {
  413: "El archivo supera el máximo de 10 MB.", 415: "Solo se permiten archivos PDF, JPEG o PNG.",
  403: "Tu sesión no tiene permiso de escritura.", 503: "El almacenamiento no está disponible. Reintenta más tarde con los mismos datos.",
};

export function ExamUpload({ token, clinicId, patientId, examTypes, examId, canWrite = true, onPermissionDenied, onDone, onCancel }: Props) {
  const { setExitWarning } = useAuth();
  const fileId = useId();
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState(localToday);
  const [examTypeId, setExamTypeId] = useState("");
  const [professionalName, setProfessionalName] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const prepared = useRef<PreparedUpload | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const guarded = saving || uncertain;
  const blocker = useBlocker(guarded);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setExitWarning(guarded ? LEAVE_WARNING : null);
    return () => setExitWarning(null);
  }, [guarded, setExitWarning]);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm(LEAVE_WARNING)) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  useBeforeUnload(useCallback((event: BeforeUnloadEvent) => {
    if (guarded) { event.preventDefault(); event.returnValue = ""; }
  }, [guarded]));

  const changed = () => { prepared.current = null; setError(null); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || !canWrite) return;
    setError(null);
    if (!file) return setError("Selecciona un archivo.");
    if (!examId) {
      if (!title.trim() || title.trim().length > 200) return setError("Ingresa un título de hasta 200 caracteres.");
      if (!examTypeId) return setError("Elige el tipo de examen.");
      if (!validClinicalDate(examDate)) return setError("Ingresa una fecha de examen válida.");
      if (professionalName.trim().length > 200 || notes.trim().length > 2000) return setError("Profesional admite hasta 200 caracteres y notas hasta 2.000.");
    }
    busy.current = true;
    setSaving(true);
    let succeeded = false;
    try {
      prepared.current ??= await prepareUpload({ clinicId, patientId, file }, examId ? { examId } : {
        title: title.trim(), examDate, examTypeId, professionalName: professionalName.trim(), notes: notes.trim(),
      });
      await sendPreparedUpload(prepared.current, token);
      succeeded = true;
      if (mounted.current) { setUncertain(false); setExitWarning(null); }
    } catch (err) {
      if (mounted.current) {
        const ambiguous = err instanceof ApiError && (err.status === 0 || err.status >= 500);
        setUncertain(ambiguous || uncertain);
        setError(err instanceof ApiError ? (MESSAGES[err.status] ?? err.message) : err instanceof Error ? err.message : "No se pudo subir el archivo.");
        if (err instanceof ApiError && err.status === 403) await onPermissionDenied?.().catch(() => undefined);
      }
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
    if (succeeded && mounted.current) onDone();
  };

  return <form onSubmit={submit} noValidate className="stack upload-form">
    <h3>{examId ? "Subir nueva versión" : "Subir examen"}</h3>
    {examId ? <p>El servidor asignará la siguiente versión. Los datos del examen se conservan.</p> : null}
    {error ? <FormBanner tone="error">{error}</FormBanner> : null}
    {uncertain ? <p role="status">La carga está sin confirmar. Reintenta con los mismos datos para evitar duplicados. No se conservará al cerrar esta página.</p> : null}
    {!canWrite ? <FormBanner tone="error">Tu acceso es de solo lectura.</FormBanner> : null}
    <fieldset disabled={saving || uncertain || !canWrite} className="upload-fields" onChange={changed}>
      {!examId ? <>
        <TextField label="Título" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
        <SelectField label="Tipo de examen" value={examTypeId} onChange={e => setExamTypeId(e.target.value)}
          options={[{ value: "", label: "Selecciona…" }, ...examTypes.map(t => ({ value: t.id, label: t.name }))]} />
        <TextField label="Fecha del examen" type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
        <TextField label="Profesional (opcional)" maxLength={200} value={professionalName} onChange={e => setProfessionalName(e.target.value)} />
        <div className="field"><label htmlFor={`${fileId}-notes`}>Notas (opcional)</label>
          <textarea id={`${fileId}-notes`} maxLength={2000} rows={4} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </> : null}
      <div className="field"><label htmlFor={fileId}>Archivo (PDF, JPEG o PNG, máx. 10 MB)</label>
        <input id={fileId} type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </div>
    </fieldset>
    <div className="row-actions">
      <Button type="submit" loading={saving} disabled={!canWrite}>{uncertain ? "Reintentar con los mismos datos" : "Subir"}</Button>
      {uncertain ? <Button type="button" variant="ghost" disabled={saving} onClick={() => {
        if (window.confirm("La carga anterior puede haberse recibido. Modificar los datos creará otra operación. ¿Quieres continuar?")) {
          prepared.current = null; setUncertain(false); setError(null);
        }
      }}>Modificar datos</Button> : null}
      <Button type="button" variant="ghost" disabled={saving} onClick={() => {
        if (!guarded || window.confirm(LEAVE_WARNING)) onCancel();
      }}>Cancelar</Button>
    </div>
  </form>;
}
