import { useState } from "react";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { SelectField } from "./ui/SelectField";
import { FormBanner } from "./ui/FormBanner";
import { ApiError, type ExamType } from "../lib/api";
import { uploadNewExam, uploadNewVersion, validateFile } from "../lib/exams";

type Props = {
  token: string; clinicId: string; patientId: string; examTypes: ExamType[];
  /** Si viene examId, sube una nueva versión de ese examen; si no, crea un examen. */
  examId?: string;
  onDone: () => void; onCancel: () => void;
};

const MESSAGES: Record<number, string> = {
  413: "El archivo supera el máximo de 10 MB.",
  415: "Solo se permiten archivos PDF, JPEG o PNG.",
  403: "Tu sesión no tiene permiso de escritura.",
  503: "El almacenamiento no está disponible. Intenta más tarde.",
};

export function ExamUpload({ token, clinicId, patientId, examTypes, examId, onDone, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState(today);
  const [examTypeId, setExamTypeId] = useState("");
  const [professionalName, setProfessionalName] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Selecciona un archivo.");
    const fileError = validateFile(file);
    if (fileError) return setError(fileError);
    if (!examId) {
      if (!title.trim()) return setError("Ingresa un título.");
      if (!examTypeId) return setError("Elige el tipo de examen.");
      if (!examDate || examDate > today) return setError("La fecha del examen no puede ser futura.");
    }
    setSaving(true);
    try {
      const common = { token, clinicId, patientId, file };
      if (examId) await uploadNewVersion(common, examId);
      else await uploadNewExam(common, { title: title.trim(), examDate, examTypeId, professionalName: professionalName.trim(), notes: notes.trim() });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? (MESSAGES[err.status] ?? err.message) : "No se pudo subir el archivo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="stack upload-form">
      <h3>{examId ? "Subir nueva versión" : "Subir examen"}</h3>
      {error ? <FormBanner tone="error">{error}</FormBanner> : null}
      {!examId ? (
        <>
          <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <SelectField label="Tipo de examen" value={examTypeId} onChange={(e) => setExamTypeId(e.target.value)}
            options={[{ value: "", label: "Selecciona…" }, ...examTypes.map((t) => ({ value: t.id, label: t.name }))]} />
          <TextField label="Fecha del examen" type="date" max={today} value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          <TextField label="Profesional (opcional)" value={professionalName} onChange={(e) => setProfessionalName(e.target.value)} />
          <TextField label="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </>
      ) : null}
      <div className="field">
        <label htmlFor="exam-file">Archivo (PDF, JPEG o PNG, máx. 10 MB)</label>
        <input id="exam-file" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="row-actions">
        <Button type="submit" loading={saving}>Subir</Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
      </div>
    </form>
  );
}
