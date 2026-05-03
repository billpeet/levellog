export const defaultLevelTypes = [
	{ code: 'CL', name: 'Current Level', kind: 'measured', colorHex: '#2563eb', sortOrder: 10 },
	{ code: 'EGL', name: 'Existing Ground Level', kind: 'measured', colorHex: '#16a34a', sortOrder: 20 },
	{ code: 'FL', name: 'Finished Level', kind: 'design', colorHex: '#ea580c', sortOrder: 30 },
	{ code: 'SL', name: 'Substrate Level', kind: 'design', colorHex: '#9333ea', sortOrder: 40 },
	{ code: 'DPC', name: 'Damp-Proof Course', kind: 'design', colorHex: '#0f766e', sortOrder: 50 },
	{ code: 'FFL', name: 'Finished Floor Level', kind: 'design', colorHex: '#dc2626', sortOrder: 60 }
] as const;
