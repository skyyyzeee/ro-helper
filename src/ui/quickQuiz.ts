import { useEffect, useState } from 'react';
import { quizRound, type QuizQuestion, type ServerPack } from '../core';

export const QUIZ_ROUND = 10;

export function useQuickQuiz(pack: ServerPack, documents: string[]) {
  const [round, setRound] = useState<QuizQuestion[] | null>(null);
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  // Another server's laws or other documents: the round on show is of them no more.
  useEffect(() => {
    setRound(null);
    setDone(false);
  }, [pack, documents]);

  const start = () => {
    setRound(quizRound(pack, documents, QUIZ_ROUND));
    setAt(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };
  const question = round && !done ? round[at] : undefined;
  const pick = (option: number) => {
    if (!question || picked !== null) return;
    setPicked(option);
    if (option === question.answer) setScore((s) => s + 1);
  };
  const next = () => {
    if (!round) return;
    if (at + 1 >= round.length) setDone(true);
    else {
      setAt(at + 1);
      setPicked(null);
    }
  };

  return { round, at, picked, score, done, question, start, pick, next };
}

export type QuickQuiz = ReturnType<typeof useQuickQuiz>;
