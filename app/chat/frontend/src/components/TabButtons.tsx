import React from 'react';

type TabType = 'build' | 'deploy' | 'observe';

interface TabButtonsProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
}

const TABS: { id: TabType; label: string }[] = [
    { id: 'build', label: 'Build' },
    { id: 'deploy', label: 'Deploy' },
    { id: 'observe', label: 'Observe' },
];

const TabButtons: React.FC<TabButtonsProps> = ({ activeTab, onTabChange }) => (
    <div className="flex gap-1 mb-3 bg-slate-900/40 p-1 rounded-lg">
        {TABS.map(tab => (
            <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    activeTab === tab.id
                        ? 'bg-slate-700/60 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                }`}
            >
                {tab.label}
            </button>
        ))}
    </div>
);

export default TabButtons;
