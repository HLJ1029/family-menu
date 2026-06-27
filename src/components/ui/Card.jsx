import { forwardRef } from "react";

export const Card = forwardRef(function Card({ children, className = "" }, ref) {
  return (
    <section ref={ref} className={`rounded-[20px] border border-line bg-white p-5 shadow-card ${className}`}>
      {children}
    </section>
  );
});
