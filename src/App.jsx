import React, { useState, useEffect } from "react";
import { Coins, Plus, LogOut, Users, Receipt, ArrowRight, X, Check, Scale } from "lucide-react";
import { db } from "./firebase";
import { ref, onValue, set, push, remove } from "firebase/database";

const ME_KEY = "cinsteMe";
const DEFAULT_MEMBERS = ["Gabi", "Ionuț", "Andrei", "Cristi"];
const GROUP_REF = ref(db, "cinste/group/members");
const ENTRIES_REF = ref(db, "cinsteEntries");

function formatDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });
}

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

export default function App() {
  const [members, setMembers] = useState(DEFAULT_MEMBERS);
  const [entries, setEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [me, setMeState] = useState(() => loadLS(ME_KEY, null));
  const [newMemberName, setNewMemberName] = useState("");
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [err, setErr] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  const [form, setForm] = useState({ amount: "", targets: [], note: "", type: "cinste" });

  useEffect(() => {
    const unsub = onValue(
      GROUP_REF,
      (snap) => {
        setConnected(true);
        const val = snap.val();
        if (val && val.length) {
          setMembers(val);
        } else {
          set(GROUP_REF, DEFAULT_MEMBERS);
        }
      },
      (e) => {
        setConnected(false);
        setErr("Eroare conexiune Firebase: " + e.message);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onValue(
      ENTRIES_REF,
      (snap) => {
        const val = snap.val() || {};
        const list = Object.entries(val).map(([id, e]) => ({ id, ...e }));
        list.sort((a, b) => (b.date || 0) - (a.date || 0));
        setEntries(list);
      },
      (e) => {
        setErr("Eroare la citirea cinstelor: " + e.message);
      }
    );
    return () => unsub();
  }, []);

  function setMe(name) {
    setMeState(name);
    try {
      localStorage.setItem(ME_KEY, JSON.stringify(name));
    } catch (e) {}
  }

  async function persistMembers(next) {
    setMembers(next);
    try {
      await set(GROUP_REF, next);
    } catch (e) {
      setErr("Nu am putut salva grupul: " + e.message);
    }
  }

  function addMember() {
    const n = newMemberName.trim();
    if (!n) return;
    if (members.includes(n)) {
      setErr("Numele există deja.");
      return;
    }
    persistMembers([...members, n]);
    setNewMemberName("");
    setErr("");
  }

  async function submitEntry() {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) {
      setErr("Introdu o sumă validă.");
      return;
    }
    const others = members.filter((m) => m !== me);
    const chosen = form.targets.length > 0 ? form.targets : others;
    if (chosen.length === 0) {
      setErr("Alege cel puțin o persoană.");
      return;
    }
    const isSplit = chosen.length > 1 && form.type === "cinste";
    const share = isSplit ? Math.round((amt / chosen.length) * 100) / 100 : amt;

    setSaveStatus("saving");
    try {
      await Promise.all(
        chosen.map((target) =>
          push(ENTRIES_REF, {
            from: me,
            to: target,
            amount: share,
            totalAmount: amt,
            splitAll: isSplit,
            splitCount: chosen.length,
            note: form.note.trim(),
            type: form.type,
            date: Date.now(),
          })
        )
      );
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 1200);
      setForm({ amount: "", targets: [], note: "", type: "cinste" });
      setShowAddEntry(false);
      setErr("");
    } catch (e) {
      setSaveStatus("error");
      setErr("Nu am putut salva: " + e.message);
    }
  }

  async function deleteEntry(id) {
    try {
      await remove(ref(db, "cinsteEntries/" + id));
    } catch (e) {
      setErr("Nu am putut șterge: " + e.message);
    }
  }

  if (!me) {
    return (
      <LoginScreen
        members={members}
        onPick={setMe}
        newMemberName={newMemberName}
        setNewMemberName={setNewMemberName}
        addMember={addMember}
        err={err}
        clearErr={() => setErr("")}
        connected={connected}
      />
    );
  }

  const received = entries.filter((e) => e.to === me);
  const given = entries.filter((e) => e.from === me);
  const totalReceived = received.reduce((s, e) => s + e.amount, 0);
  const totalGiven = given.reduce((s, e) => s + e.amount, 0);

  const others = members.filter((m) => m !== me);
  const balances = others.map((other) => {
    const theyOweMe = entries
      .filter((e) => e.from === me && e.to === other)
      .reduce((s, e) => s + e.amount, 0);
    const iOweThem = entries
      .filter((e) => e.from === other && e.to === me)
      .reduce((s, e) => s + e.amount, 0);
    return { name: other, net: Math.round((theyOweMe - iOweThem) * 100) / 100 };
  });

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans pb-24">
      <div className="border-b border-gray-200 px-5 pt-6 pb-5 sticky top-0 bg-white/95 backdrop-blur z-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 flex items-center gap-1.5">
              Caietul de cinste
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
                title={connected ? "conectat" : "deconectat"}
              />
            </p>
            <h1 className="text-2xl font-bold text-gray-900 mt-0.5">Salut, {me}</h1>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus === "saving" && <span className="text-[11px] text-gray-500">se salvează…</span>}
            {saveStatus === "saved" && (
              <span className="text-[11px] text-green-600 flex items-center gap-1">
                <Check size={12} /> salvat
              </span>
            )}
            {saveStatus === "error" && <span className="text-[11px] text-red-600">eroare</span>}
            <button
              onClick={() => setMe(null)}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors px-3 py-2 rounded-full border border-gray-300"
            >
              <LogOut size={14} /> Ieși
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Ai primit</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{totalReceived.toFixed(0)} lei</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Ai dat</p>
            <p className="text-2xl font-bold text-gray-700 mt-1">{totalGiven.toFixed(0)} lei</p>
          </div>
        </div>
      </div>

      {err && (
        <div className="mx-5 mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          {err}
        </div>
      )}

      <div className="px-5 mt-7">
        <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider mb-3">
          <Scale size={14} /> Cine cui datorează, pe scurt
        </div>
        <div className="space-y-2">
          {balances.map((b) => (
            <div
              key={b.name}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between"
            >
              <span className="text-sm font-medium text-gray-900">{b.name}</span>
              {b.net === 0 ? (
                <span className="text-sm text-gray-400">achitat ✓</span>
              ) : b.net > 0 ? (
                <span className="text-sm font-semibold text-green-600">îți datorează {b.net} lei</span>
              ) : (
                <span className="text-sm font-semibold text-red-600">îi datorezi {Math.abs(b.net)} lei</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <Section
        title="Cinste primită"
        icon={<Coins size={16} />}
        empty="Nimeni nu ți-a făcut cinste încă."
        items={received}
        deleteEntry={null}
      />

      <Section
        title="Cinste dată"
        icon={<Receipt size={16} />}
        empty="Nu ai făcut cinste nimănui încă."
        items={given}
        deleteEntry={deleteEntry}
        givenView
      />

      <div className="px-5 mt-8">
        <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider mb-3">
          <Users size={14} /> Grup ({members.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <span
              key={m}
              className={`text-sm px-3 py-1.5 rounded-full border ${
                m === me ? "border-amber-500 text-amber-700 bg-amber-50" : "border-gray-300 text-gray-600"
              }`}
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={() => setShowAddEntry(true)}
        className="fixed bottom-6 right-6 bg-amber-500 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg shadow-black/20 active:scale-95 transition-transform"
        aria-label="Adaugă cinste"
      >
        <Plus size={26} />
      </button>

      {showAddEntry && (
        <AddEntryModal
          me={me}
          members={members}
          form={form}
          setForm={setForm}
          onSubmit={submitEntry}
          onClose={() => {
            setShowAddEntry(false);
            setErr("");
          }}
        />
      )}
    </div>
  );
}

function Section({ title, icon, empty, items, deleteEntry, givenView }) {
  return (
    <div className="px-5 mt-7">
      <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider mb-3">
        {icon} {title}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.map((e) => (
            <div
              key={e.id}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
                  {e.type === "rambursare" && (
                    <span className="text-[10px] uppercase tracking-wide bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      rambursare
                    </span>
                  )}
                  {givenView ? (
                    <>
                      <span>lui {e.to}</span>
                      <ArrowRight size={12} className="text-gray-400" />
                    </>
                  ) : (
                    <>
                      <span>{e.from}</span>
                      <ArrowRight size={12} className="text-gray-400" />
                      <span>ție</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatDate(e.date)}
                  {e.splitAll ? ` · din ${e.totalAmount.toFixed(0)} lei împărțit la ${e.splitCount}` : ""}
                  {e.note ? ` · ${e.note}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-lg font-bold text-amber-600">{e.amount.toFixed(0)} lei</span>
                {deleteEntry && (
                  <button
                    onClick={() => deleteEntry(e.id)}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                    aria-label="Șterge"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LoginScreen({ members, onPick, newMemberName, setNewMemberName, addMember, err, clearErr, connected }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans flex flex-col items-center justify-center px-6">
      <Coins size={34} className="text-amber-500 mb-3" />
      <h1 className="text-3xl font-bold text-gray-900">Caietul de cinste</h1>
      <p className="text-gray-500 text-sm mt-2 text-center max-w-xs">
        Cine ești tu din grup? Alege-ți numele ca să vezi ce cinste ai primit și cui i-ai făcut.
      </p>
      <p className="text-[11px] mt-1 flex items-center gap-1">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
        <span className="text-gray-400">{connected ? "sincronizat live" : "se conectează…"}</span>
      </p>

      <div className="mt-8 w-full max-w-xs space-y-2">
        {members.map((m) => (
          <button
            key={m}
            onClick={() => onPick(m)}
            className="w-full text-left px-4 py-3 rounded-2xl border border-gray-300 hover:border-amber-500 hover:bg-amber-50 transition-colors flex items-center justify-between"
          >
            <span className="font-medium">{m}</span>
            <ArrowRight size={16} className="text-gray-400" />
          </button>
        ))}
      </div>

      <div className="mt-6 w-full max-w-xs">
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="w-full text-sm text-gray-500 hover:text-amber-600 transition-colors flex items-center justify-center gap-1.5 py-2"
          >
            <Plus size={14} /> Nu ești în listă? Adaugă-te
          </button>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <input
              autoFocus
              value={newMemberName}
              onChange={(ev) => setNewMemberName(ev.target.value)}
              onKeyDown={(ev) => ev.key === "Enter" && addMember()}
              placeholder="Numele tău"
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-amber-500"
            />
            {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={addMember} className="flex-1 bg-amber-500 text-white text-sm font-medium rounded-xl py-2">
                Adaugă
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  clearErr();
                }}
                className="px-4 text-sm text-gray-500 rounded-xl border border-gray-300"
              >
                Renunță
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddEntryModal({ me, members, form, setForm, onSubmit, onClose }) {
  const others = members.filter((m) => m !== me);

  function toggleTarget(name) {
    setForm((f) => {
      const has = f.targets.includes(name);
      return { ...f, targets: has ? f.targets.filter((t) => t !== name) : [...f.targets, name] };
    });
  }

  const chosenCount = form.targets.length > 0 ? form.targets.length : others.length;
  const share = form.amount ? (parseFloat(form.amount) / chosenCount).toFixed(1) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-20 px-0 sm:px-4">
      <div className="bg-white border border-gray-200 rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-5 pb-7 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Adaugă</h2>
          <button onClick={onClose} className="text-gray-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setForm({ ...form, type: "cinste" })}
            className={`flex-1 py-2 rounded-xl text-sm border ${
              form.type === "cinste" ? "border-amber-500 text-amber-700 bg-amber-50" : "border-gray-300 text-gray-600"
            }`}
          >
            Fac cinste
          </button>
          <button
            onClick={() => setForm({ ...form, type: "rambursare", targets: form.targets.slice(0, 1) })}
            className={`flex-1 py-2 rounded-xl text-sm border ${
              form.type === "rambursare" ? "border-blue-500 text-blue-700 bg-blue-50" : "border-gray-300 text-gray-600"
            }`}
          >
            Dau banii înapoi
          </button>
        </div>

        <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Sumă (lei)</p>
        <input
          type="number"
          inputMode="decimal"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="ex: 80"
          className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 text-lg font-semibold focus:outline-none focus:border-amber-500 mb-4"
        />

        <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">
          {form.type === "rambursare"
            ? "Cui îi dai banii înapoi"
            : "Cui — alege pe cine vrei (dacă nu alegi pe nimeni, se împarte la toți)"}
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          {others.map((m) => {
            const active = form.targets.includes(m);
            return (
              <button
                key={m}
                onClick={() => {
                  if (form.type === "rambursare") {
                    setForm({ ...form, targets: [m] });
                  } else {
                    toggleTarget(m);
                  }
                }}
                className={`px-3 py-1.5 rounded-full text-sm border flex items-center gap-1 ${
                  active ? "border-amber-500 text-amber-700 bg-amber-50" : "border-gray-300 text-gray-600"
                }`}
              >
                {active && <Check size={12} />}
                {m}
              </button>
            );
          })}
        </div>
        {form.type === "cinste" && form.targets.length > 0 && (
          <button
            onClick={() => setForm({ ...form, targets: [] })}
            className="text-xs text-gray-500 underline mb-3"
          >
            Resetează selecția (= toată gașca)
          </button>
        )}

        {form.type === "cinste" && form.amount && chosenCount > 0 && (
          <p className="text-xs text-gray-500 mb-4">
            {chosenCount > 1
              ? `Se împarte egal: ${share} lei × ${chosenCount} persoane`
              : `${form.amount} lei către o singură persoană`}
          </p>
        )}

        <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Notă (opțional)</p>
        <input
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="ex: bere la terasă"
          className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-amber-500 mb-5"
        />

        <button onClick={onSubmit} className="w-full bg-amber-500 text-white font-semibold rounded-xl py-3">
          Salvează
        </button>
      </div>
    </div>
  );
}
