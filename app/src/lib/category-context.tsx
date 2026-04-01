'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type LeadCategory = 'VERTRIEB' | 'RECRUITING';

const STORAGE_KEY = 'microcrm-category';

const CategoryContext = createContext<{
  category: LeadCategory;
  setCategory: (c: LeadCategory) => void;
}>({ category: 'VERTRIEB', setCategory: () => {} });

export function CategoryProvider({ children }: { children: ReactNode }) {
  const [category, setCategoryState] = useState<LeadCategory>('VERTRIEB');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'VERTRIEB' || stored === 'RECRUITING') {
      setCategoryState(stored);
    }
  }, []);

  function setCategory(c: LeadCategory) {
    setCategoryState(c);
    localStorage.setItem(STORAGE_KEY, c);
  }

  return (
    <CategoryContext.Provider value={{ category, setCategory }}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategory() {
  return useContext(CategoryContext);
}
