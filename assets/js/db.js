// Banco de dados simulado (localStorage) para o portal do Calendário de Automonitoramento
// Nutricionista Jessica Melo

const DB_KEY_USERS = 'jessicamelo_users';
const DB_KEY_CALENDARS = 'jessicamelo_calendars';
const DB_KEY_SESSION = 'jessicamelo_session';

// Inicializa dados falsos se o banco estiver vazio
function initDatabase() {
    if (!localStorage.getItem(DB_KEY_USERS)) {
        const defaultUsers = [
            {
                email: 'admin@jessicamelo.com.br',
                password: 'admin',
                name: 'Dra. Jessica Melo',
                role: 'admin'
            },
            {
                email: 'paciente@exemplo.com',
                password: '123',
                name: 'Lucas Silva',
                role: 'patient',
                isFirstAccess: true
            },
            {
                email: 'mariasilva@exemplo.com',
                password: '123',
                name: 'Maria de Sousa',
                role: 'patient',
                isFirstAccess: true
            },
            {
                email: 'carlos.oliveira@exemplo.com',
                password: '123',
                name: 'Carlos Oliveira',
                role: 'patient',
                isFirstAccess: true
            }
        ];
        localStorage.setItem(DB_KEY_USERS, JSON.stringify(defaultUsers));
    }

    if (!localStorage.getItem(DB_KEY_CALENDARS)) {
        // Dados iniciais pré-preenchidos para simulação elegante
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth(); // 0-indexed (0 = Jan, 6 = Jul)
        
        const defaultCalendars = {
            'paciente@exemplo.com': {
                [`${currentYear}-${currentMonth}`]: {
                    days: {
                        1: { A: true, T: true, H: true },
                        2: { A: true, T: false, H: true },
                        3: { A: false, T: true, H: true },
                        4: { A: true, T: false, H: false },
                        5: { A: true, T: true, H: true },
                        6: { A: true, T: true, H: true },
                        7: { A: false, T: false, H: true },
                        8: { A: true, T: true, H: true },
                        9: { A: true, T: true, H: true }
                    },
                    notes: 'Esta semana foi um pouco corrida por conta do trabalho, mas consegui manter a hidratação e treinar 4 vezes!'
                }
            },
            'mariasilva@exemplo.com': {
                [`${currentYear}-${currentMonth}`]: {
                    days: {
                        1: { A: true, T: false, H: true },
                        2: { A: true, T: false, H: true },
                        3: { A: true, T: false, H: true },
                        4: { A: true, T: false, H: true },
                        5: { A: false, T: false, H: false },
                        6: { A: true, T: true, H: true },
                        7: { A: true, T: true, H: true }
                    },
                    notes: 'Foco na alimentação essa semana, mas sem tempo para treinar nos primeiros dias.'
                }
            }
        };
        localStorage.setItem(DB_KEY_CALENDARS, JSON.stringify(defaultCalendars));
    }
}

// Chamar inicialização imediatamente
initDatabase();

export const db = {
    // Autenticação
    login(email, password) {
        const users = JSON.parse(localStorage.getItem(DB_KEY_USERS)) || [];
        const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
        if (user) {
            const sessionData = { 
                email: user.email, 
                name: user.name, 
                role: user.role,
                isFirstAccess: user.role === 'patient' ? !!user.isFirstAccess : false
            };
            localStorage.setItem(DB_KEY_SESSION, JSON.stringify(sessionData));
            return { success: true, user: sessionData };
        }
        return { success: false, message: 'E-mail ou senha incorretos.' };
    },

    changePassword(email, newPassword) {
        const users = JSON.parse(localStorage.getItem(DB_KEY_USERS)) || [];
        const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
        if (userIndex !== -1) {
            users[userIndex].password = newPassword;
            if (users[userIndex].role === 'patient') {
                delete users[userIndex].isFirstAccess; // remove flag de primeiro acesso após trocar a senha
            }
            localStorage.setItem(DB_KEY_USERS, JSON.stringify(users));

            // Atualiza sessão se for o próprio logado mudando
            const currentSession = this.getCurrentSession();
            if (currentSession && currentSession.email.toLowerCase() === email.toLowerCase()) {
                currentSession.isFirstAccess = false;
                localStorage.setItem(DB_KEY_SESSION, JSON.stringify(currentSession));
            }
            return { success: true };
        }
        return { success: false, message: 'Usuário não encontrado.' };
    },

    logout() {
        localStorage.removeItem(DB_KEY_SESSION);
    },

    getCurrentSession() {
        const session = localStorage.getItem(DB_KEY_SESSION);
        return session ? JSON.parse(session) : null;
    },

    // Pacientes
    getPatients() {
        const users = JSON.parse(localStorage.getItem(DB_KEY_USERS)) || [];
        return users.filter(u => u.role === 'patient');
    },

    addPatient(name, email, password) {
        const users = JSON.parse(localStorage.getItem(DB_KEY_USERS)) || [];
        if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
            return { success: false, message: 'Este e-mail já está cadastrado.' };
        }
        users.push({ name, email, password, role: 'patient', isFirstAccess: true });
        localStorage.setItem(DB_KEY_USERS, JSON.stringify(users));
        return { success: true };
    },

    resetPatientPassword(email, newPassword) {
        const users = JSON.parse(localStorage.getItem(DB_KEY_USERS)) || [];
        const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase() && u.role === 'patient');
        if (userIndex !== -1) {
            users[userIndex].password = newPassword;
            users[userIndex].isFirstAccess = true; // Força nova troca no primeiro acesso dele
            localStorage.setItem(DB_KEY_USERS, JSON.stringify(users));
            return { success: true };
        }
        return { success: false, message: 'Paciente não encontrado.' };
    },

    deletePatient(email) {
        let users = JSON.parse(localStorage.getItem(DB_KEY_USERS)) || [];
        users = users.filter(u => u.email.toLowerCase() !== email.toLowerCase());
        localStorage.setItem(DB_KEY_USERS, JSON.stringify(users));

        // Limpa calendário dele também
        const calendars = JSON.parse(localStorage.getItem(DB_KEY_CALENDARS)) || {};
        delete calendars[email];
        localStorage.setItem(DB_KEY_CALENDARS, JSON.stringify(calendars));
        return { success: true };
    },

    // Calendários
    getCalendarData(email, year, month) {
        const calendars = JSON.parse(localStorage.getItem(DB_KEY_CALENDARS)) || {};
        const key = `${year}-${month}`;
        if (calendars[email] && calendars[email][key]) {
            return calendars[email][key];
        }
        return { days: {}, notes: '' };
    },

    saveCalendarData(email, year, month, days, notes) {
        const calendars = JSON.parse(localStorage.getItem(DB_KEY_CALENDARS)) || {};
        const key = `${year}-${month}`;
        if (!calendars[email]) {
            calendars[email] = {};
        }
        calendars[email][key] = { days, notes };
        localStorage.setItem(DB_KEY_CALENDARS, JSON.stringify(calendars));
        return { success: true };
    }
};
