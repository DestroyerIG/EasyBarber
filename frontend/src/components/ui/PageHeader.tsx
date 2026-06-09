'use client';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 sm:mb-8 gap-4">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white">{title}</h2>
        {description && <p className="text-gray-500 mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}
