// Application State
const appState = {
    currentView: 'dashboard',
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    selectedDate: null,
    pieChart: null,
    barChart: null,
    theme: 'light'
};

// Initialize application
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
});

function initializeApp() {
    // Check and update login streak
    checkLoginStreak();
    loadTheme();
    initTimer();
    initTimer();

    // Load and display data
    checkOverdueTasks();
    updateDashboard();
    renderTasks();
    renderCalendar();
    setupEventListeners();

    // Initialize chatbot
    initializeChatbot();

    // Initialize charts
    setTimeout(() => {
        renderPieChart();
        renderBarChart();
    }, 100);

    // Set up auto-check for overdue tasks every hour
    setInterval(checkOverdueTasks, 3600000); // 1 hour
}

function setupEventListeners() {
    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            const view = this.dataset.view;
            switchView(view);
        });
    });

    // Add task button
    document.getElementById('addTaskBtn').addEventListener('click', () => {
        document.getElementById('addTaskForm').style.display = 'block';
        document.getElementById('taskForm').reset();
        // Set default deadline to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('taskDeadlineDate').value = today;
        document.getElementById('taskDeadlineTime').value = '23:59';
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Cancel task form
    document.getElementById('cancelTaskBtn').addEventListener('click', () => {
        document.getElementById('addTaskForm').style.display = 'none';
    });

    // Task form submission
    document.getElementById('taskForm').addEventListener('submit', addTask);

    // Task filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const filter = this.dataset.filter;
            renderTasks(filter);
        });
    });

    // Calendar navigation
    document.getElementById('prevMonthBtn').addEventListener('click', () => {
        appState.currentMonth--;
        if (appState.currentMonth < 0) {
            appState.currentMonth = 11;
            appState.currentYear--;
        }
        renderCalendar();
    });

    document.getElementById('nextMonthBtn').addEventListener('click', () => {
        appState.currentMonth++;
        if (appState.currentMonth > 11) {
            appState.currentMonth = 0;
            appState.currentYear++;
        }
        renderCalendar();
    });
}

// View Switching
function switchView(view) {
    appState.currentView = view;

    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.view === view) {
            tab.classList.add('active');
        }
    });

    // Update views
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
    });
    document.getElementById(view + 'View').classList.add('active');

    // Refresh data for current view
    if (view === 'dashboard') {
        updateDashboard();
    } else if (view === 'tasks') {
        renderTasks();
    } else if (view === 'calendar') {
        renderCalendar();
    } else if (view === 'progress') {
        renderPieChart();
        renderBarChart();
        updateProgressStats();
    }
}

// Task Management Functions
function getTasks() {
    const tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
    return tasks.map(task => ({
        ...task,
        deadline: new Date(task.deadline)
    }));
}

function saveTasks(tasks) {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

function addTask(e) {
    e.preventDefault();

    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const deadlineDate = document.getElementById('taskDeadlineDate').value;
    const selectedTime = document.getElementById('taskDeadlineTime').value;
    const category = document.getElementById('taskCategory').value;
    const priority = document.getElementById('taskPriority').value;

    if (!title || !deadlineDate || !selectedTime) {
        alert('Please fill in all required fields');
        return;
    }

    const deadline = new Date(`${deadlineDate}T${selectedTime}`);

    const task = {
        id: Date.now().toString(),
        title: title,
        description: description,
        deadline: deadline.toISOString(),
        category: category || 'general',
        priority: priority,
        completed: false,
        completedAt: null,
        createdAt: new Date().toISOString()
    };

    const tasks = getTasks();
    tasks.push(task);
    saveTasks(tasks);

    // Hide form
    document.getElementById('addTaskForm').style.display = 'none';
    document.getElementById('taskForm').reset();

    // Refresh displays
    renderTasks();
    updateDashboard();
    renderCalendar();
    renderPieChart();
    renderBarChart();
}

function handleTaskCheckboxChange(taskId, checkbox) {
    const tasks = getTasks();
    const task = tasks.find(t => t.id === taskId);

    if (task && task.completed && !checkbox.checked) {
        // Task is completed and user is trying to uncheck - prevent default and show dialog
        const wasChecked = checkbox.checked;
        checkbox.checked = true; // Keep it checked temporarily

        // Show confirmation dialog
        const pointsAwarded = task.pointsAwarded || 0;
        const confirmMessage = `The work has already been done. If you want to undo this, the rewards (${pointsAwarded} points) will be subtracted from your total. Do you want to continue?`;

        if (confirm(confirmMessage)) {
            // User confirmed - proceed with unchecking
            updateTaskStatus(taskId, false);
        } else {
            // User cancelled - ensure checkbox stays checked
            checkbox.checked = true;
        }
    } else {
        // Normal flow - task is being checked
        updateTaskStatus(taskId, checkbox.checked);
    }
}

function updateTaskStatus(taskId, completed) {
    const tasks = getTasks();
    const task = tasks.find(t => t.id === taskId);

    if (task) {
        // If task is already completed and user is trying to uncheck it
        if (task.completed && !completed) {
            // Undo completion
            task.completed = false;
            task.completedAt = null;

            // Subtract the points that were awarded
            const pointsAwarded = task.pointsAwarded || 0;
            if (pointsAwarded > 0) {
                subtractPoints(pointsAwarded);
            }

            task.pointsAwarded = null; // Clear the points awarded

            saveTasks(tasks);

            // Refresh displays
            renderTasks();
            updateDashboard();
            renderCalendar();
            renderPieChart();
            renderBarChart();
            updateProgressStats();
            return;
        }

        // Normal completion flow
        task.completed = completed;
        task.completedAt = completed ? new Date().toISOString() : null;

        // Award points if completing
        if (completed) {
            const pointsEarned = awardPoints(task);
            task.pointsAwarded = pointsEarned; // Store points awarded for this task

            // Show celebration message in chatbot
            setTimeout(() => {
                if (!chatbotState.isOpen) {
                    document.getElementById('chatbotBadge').style.display = 'block';
                }
                if (chatbotState.isOpen || Math.random() > 0.7) {
                    const celebrationMessages = [
                        `🎉 Awesome! You just completed "${task.title}"! Great job! Keep the momentum going! 💪`,
                        `✨ Fantastic work! Task "${task.title}" is done! You're on fire! 🔥`,
                        `🌟 Excellent! You completed "${task.title}"! Every completed task brings you closer to your goals! 🚀`
                    ];
                    sendBotMessage(celebrationMessages[Math.floor(Math.random() * celebrationMessages.length)]);
                }
            }, 500);
        }

        saveTasks(tasks);

        // Refresh displays
        renderTasks();
        updateDashboard();
        renderCalendar();
        renderPieChart();
        renderBarChart();
        updateProgressStats();
    }
}

function deleteTask(taskId) {
    if (confirm('Are you sure you want to delete this task?')) {
        const tasks = getTasks();
        const filtered = tasks.filter(t => t.id !== taskId);
        saveTasks(filtered);

        // Refresh displays
        renderTasks();
        updateDashboard();
        renderCalendar();
        renderPieChart();
        renderBarChart();
    }
}

function checkOverdueTasks() {
    const tasks = getTasks();
    const now = new Date();
    let updated = false;

    tasks.forEach(task => {
        const deadline = new Date(task.deadline);
        if (!task.completed && deadline < now) {
            // Task is overdue - mark as incomplete if not already marked
            updated = true;
        }
    });

    if (updated) {
        saveTasks(tasks);
        renderTasks();
        updateDashboard();
    }
}

function getTasksByDate(date) {
    const tasks = getTasks();
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    return tasks.filter(task => {
        const taskDate = new Date(task.deadline);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate.getTime() === targetDate.getTime();
    });
}

function getTasksByFilter(filter) {
    const tasks = getTasks();
    const now = new Date();

    switch (filter) {
        case 'pending':
            return tasks.filter(t => !t.completed && new Date(t.deadline) >= now);
        case 'completed':
            return tasks.filter(t => t.completed);
        case 'overdue':
            return tasks.filter(t => !t.completed && new Date(t.deadline) < now);
        default:
            return tasks;
    }
}

function renderTasks(filter = 'all') {
    const tasks = filter === 'all' ? getTasks() : getTasksByFilter(filter);
    const container = document.getElementById('tasksList');

    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-tasks"></i><p>No tasks found</p></div>';
        return;
    }

    // Sort tasks: overdue first, then by deadline
    tasks.sort((a, b) => {
        const aDeadline = new Date(a.deadline);
        const bDeadline = new Date(b.deadline);
        const now = new Date();

        const aOverdue = !a.completed && aDeadline < now;
        const bOverdue = !b.completed && bDeadline < now;

        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;

        return aDeadline - bDeadline;
    });

    container.innerHTML = tasks.map(task => {
        const deadline = new Date(task.deadline);
        const now = new Date();
        const isOverdue = !task.completed && deadline < now;
        const statusClass = task.completed ? 'completed' : (isOverdue ? 'overdue' : 'pending');

        return `
            <div class="task-card ${statusClass}">
                <div class="task-checkbox">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} 
                           onchange="handleTaskCheckboxChange('${task.id}', this)">
                </div>
                <div class="task-content">
                    <h3>${escapeHtml(task.title)}</h3>
                    ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ''}
                    <div class="task-meta">
                        <span class="task-deadline">
                            <i class="fas fa-clock"></i>
                            ${formatDateTime(deadline)}
                        </span>
                        <span class="task-priority priority-${task.priority}">
                            ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                        </span>
                        <span class="task-category category-${task.category || 'general'}">
                            ${(task.category || 'general').charAt(0).toUpperCase() + (task.category || 'general').slice(1)}
                        </span>
        </div>
                </div>
                <div class="task-actions">
                    <button class="btn-icon" onclick="deleteTask('${task.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateDashboard() {
    const tasks = getTasks();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)

    // Tasks today
    const todayTasks = tasks.filter(t => {
        const taskDate = new Date(t.deadline);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate.getTime() === today.getTime();
    });

    // Completed this week
    const weekCompleted = tasks.filter(t => {
        if (!t.completed || !t.completedAt) return false;
        const completedDate = new Date(t.completedAt);
        return completedDate >= weekStart;
    });

    // Overdue tasks
    const overdueTasks = tasks.filter(t => !t.completed && new Date(t.deadline) < now);

    document.getElementById('todayTasksCount').textContent = todayTasks.length;
    document.getElementById('weekCompletedCount').textContent = weekCompleted.length;
    document.getElementById('overdueTasksCount').textContent = overdueTasks.length;

    // Recent tasks (last 5)
    const recentTasks = tasks.slice(-5).reverse();
    const recentContainer = document.getElementById('recentTasksList');

    if (recentTasks.length === 0) {
        recentContainer.innerHTML = '<div class="empty-state"><i class="fas fa-tasks"></i><p>No tasks yet</p></div>';
    } else {
        recentContainer.innerHTML = recentTasks.map(task => {
            const deadline = new Date(task.deadline);
            const isOverdue = !task.completed && deadline < now;
            const statusClass = task.completed ? 'completed' : (isOverdue ? 'overdue' : 'pending');

            return `
                <div class="task-card ${statusClass}">
                <div class="task-checkbox">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} 
                           onchange="handleTaskCheckboxChange('${task.id}', this)">
                </div>
                    <div class="task-content">
                        <h3>${escapeHtml(task.title)}</h3>
                        <div class="task-meta">
                            <span class="task-deadline">
                                <i class="fas fa-clock"></i>
                                ${formatDateTime(deadline)}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// Calendar Functions
function renderCalendar() {
    const container = document.getElementById('calendarContainer');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    document.getElementById('currentMonthYear').textContent =
        `${monthNames[appState.currentMonth]} ${appState.currentYear}`;

    const firstDay = new Date(appState.currentYear, appState.currentMonth, 1);
    const lastDay = new Date(appState.currentYear, appState.currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const tasks = getTasks();
    const today = new Date();

    let html = '<div class="calendar-grid">';
    html += '<div class="calendar-day-name">Sun</div>';
    html += '<div class="calendar-day-name">Mon</div>';
    html += '<div class="calendar-day-name">Tue</div>';
    html += '<div class="calendar-day-name">Wed</div>';
    html += '<div class="calendar-day-name">Thu</div>';
    html += '<div class="calendar-day-name">Fri</div>';
    html += '<div class="calendar-day-name">Sat</div>';

    // Empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(appState.currentYear, appState.currentMonth, day);
        const dateStr = date.toISOString().split('T')[0];
        const dayTasks = tasks.filter(t => {
            const taskDate = new Date(t.deadline);
            return taskDate.getFullYear() === date.getFullYear() &&
                taskDate.getMonth() === date.getMonth() &&
                taskDate.getDate() === day;
        });

        const completedCount = dayTasks.filter(t => t.completed).length;
        const pendingCount = dayTasks.filter(t => !t.completed).length;
        const isToday = date.toDateString() === today.toDateString();
        const isPast = date < today && !isToday;

        let dayClass = 'calendar-day';
        if (isToday) dayClass += ' today';
        if (isPast) dayClass += ' past';

        html += `
            <div class="${dayClass}" data-date="${dateStr}" onclick="selectDate('${dateStr}')">
                <div class="day-number">${day}</div>
                ${dayTasks.length > 0 ? `
                    <div class="day-tasks">
                        ${completedCount > 0 ? `<span class="task-indicator completed">${completedCount}</span>` : ''}
                        ${pendingCount > 0 ? `<span class="task-indicator pending">${pendingCount}</span>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;
}

function selectDate(dateStr) {
    appState.selectedDate = dateStr;
    const tasks = getTasksByDate(dateStr);
    const date = new Date(dateStr);

    document.getElementById('selectedDateTitle').textContent =
        `Tasks for ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

    const container = document.getElementById('dateTasksList');
    const dateContainer = document.getElementById('selectedDateTasks');

    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-tasks"></i><p>No tasks for this date</p></div>';
    } else {
        container.innerHTML = tasks.map(task => {
            const deadline = new Date(task.deadline);
            const statusClass = task.completed ? 'completed' : 'pending';

            return `
                <div class="task-card ${statusClass}">
                <div class="task-checkbox">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} 
                           onchange="handleTaskCheckboxChange('${task.id}', this)">
                </div>
                    <div class="task-content">
                        <h3>${escapeHtml(task.title)}</h3>
                        ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ''}
                        <div class="task-meta">
                            <span class="task-deadline">
                                <i class="fas fa-clock"></i>
                                ${formatDateTime(deadline)}
                            </span>
            </div>
            </div>
        </div>
    `;
        }).join('');
    }

    dateContainer.style.display = 'block';
}

// Chart Functions
function renderPieChart() {
    const tasks = getTasks();
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Start of week
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const weekTasks = tasks.filter(t => {
        const taskDate = new Date(t.deadline);
        return taskDate >= weekStart && taskDate <= weekEnd;
    });

    const completed = weekTasks.filter(t => t.completed).length;
    const incomplete = weekTasks.filter(t => !t.completed).length;

    const ctx = document.getElementById('pieChart').getContext('2d');

    if (appState.pieChart) {
        appState.pieChart.destroy();
    }

    appState.pieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Completed', 'Incomplete'],
            datasets: [{
                data: [completed, incomplete],
                backgroundColor: ['#10b981', '#f59e0b'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = completed + incomplete;
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderBarChart() {
    const tasks = getTasks();
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const labels = [];
    const completedData = [];
    const pendingData = [];

    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];

        labels.push(days[i]);

        const dayTasks = tasks.filter(t => {
            const taskDate = new Date(t.deadline);
            const taskDateStr = taskDate.toISOString().split('T')[0];
            return taskDateStr === dateStr;
        });

        completedData.push(dayTasks.filter(t => t.completed).length);
        pendingData.push(dayTasks.filter(t => !t.completed).length);
    }

    const ctx = document.getElementById('barChart').getContext('2d');

    if (appState.barChart) {
        appState.barChart.destroy();
    }

    appState.barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Completed',
                    data: completedData,
                    backgroundColor: '#10b981'
                },
                {
                    label: 'Pending',
                    data: pendingData,
                    backgroundColor: '#f59e0b'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top'
                }
            }
        }
    });
}

function updateProgressStats() {
    const tasks = getTasks();
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = tasks.filter(t => !t.completed).length;
    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;

    document.getElementById('completionRate').textContent = completionRate + '%';
    document.getElementById('totalCompleted').textContent = completed;
    document.getElementById('totalPending').textContent = pending;
}

// Streak System
function checkLoginStreak() {
    const streakData = JSON.parse(localStorage.getItem('streak') || '{"current": 0, "lastLoginDate": null}');
    const today = new Date().toDateString();
    const lastLogin = streakData.lastLoginDate ? new Date(streakData.lastLoginDate).toDateString() : null;

    if (!lastLogin) {
        // First login
        streakData.current = 1;
        streakData.lastLoginDate = new Date().toISOString();
    } else if (lastLogin === today) {
        // Already logged in today, don't increment
    } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();

        if (lastLogin === yesterdayStr) {
            // Consecutive day
            streakData.current++;
        } else {
            // Streak broken
            streakData.current = 1;
        }
        streakData.lastLoginDate = new Date().toISOString();
    }

    localStorage.setItem('streak', JSON.stringify(streakData));
    updateStreakDisplay(streakData.current);
}

function updateStreakDisplay(streak) {
    document.getElementById('streakCount').textContent = streak;
}

// Theme System
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    appState.theme = savedTheme;

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        document.querySelector('#themeToggle i').className = 'fas fa-sun';
    } else {
        document.body.classList.remove('dark-mode');
        document.querySelector('#themeToggle i').className = 'fas fa-moon';
    }
}

function toggleTheme() {
    appState.theme = appState.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', appState.theme);

    if (appState.theme === 'dark') {
        document.body.classList.add('dark-mode');
        document.querySelector('#themeToggle i').className = 'fas fa-sun';
    } else {
        document.body.classList.remove('dark-mode');
        document.querySelector('#themeToggle i').className = 'fas fa-moon';
    }
}

// Points System
function awardPoints(task) {
    const pointsData = JSON.parse(localStorage.getItem('points') || '0');
    let currentPoints = parseInt(pointsData) || 0;

    // Calculate points earned for this task
    let pointsEarned = 0;

    // Base points for completing a task
    let basePoints = 10;

    // Priority-based bonus points
    if (task.priority === 'high') {
        basePoints = 15; // High priority tasks worth more
    } else if (task.priority === 'medium') {
        basePoints = 10; // Medium priority
    } else {
        basePoints = 8; // Low priority
    }

    pointsEarned += basePoints;

    // Bonus points for completing before deadline
    const deadline = new Date(task.deadline);
    const completedAt = new Date(task.completedAt);

    if (completedAt < deadline) {
        const hoursEarly = (deadline - completedAt) / (1000 * 60 * 60);
        if (hoursEarly >= 48) {
            pointsEarned += 10; // Bonus for completing more than 48 hours early
        } else if (hoursEarly >= 24) {
            pointsEarned += 5; // Bonus for completing more than 24 hours early
        } else if (hoursEarly >= 12) {
            pointsEarned += 3; // Bonus for completing more than 12 hours early
        } else if (hoursEarly >= 1) {
            pointsEarned += 1; // Small bonus for completing at least 1 hour early
        }
    }

    // Streak bonus points
    const streakData = JSON.parse(localStorage.getItem('streak') || '{"current": 0}');
    const streak = streakData.current || 0;
    if (streak >= 7) {
        pointsEarned += 5; // Bonus for 7+ day streak
    } else if (streak >= 3) {
        pointsEarned += 2; // Bonus for 3+ day streak
    }

    // Update total points
    const previousPoints = currentPoints;
    currentPoints += pointsEarned;
    localStorage.setItem('points', currentPoints.toString());
    updatePointsDisplay(currentPoints);

    // Check for celebration (200 points)
    if (previousPoints < 200 && currentPoints >= 200) {
        triggerCelebration();
    }

    // Return points earned for this specific task
    return pointsEarned;
}

function subtractPoints(pointsToSubtract) {
    const pointsData = JSON.parse(localStorage.getItem('points') || '0');
    let points = parseInt(pointsData) || 0;
    points = Math.max(0, points - pointsToSubtract); // Ensure points don't go negative
    localStorage.setItem('points', points.toString());
    updatePointsDisplay(points);
}

function updatePointsDisplay(points) {
    document.getElementById('pointsCount').textContent = points || 0;
}

function resetPoints() {
    if (confirm('Are you sure you want to reset your points to zero? This action cannot be undone.')) {
        localStorage.setItem('points', '0');
        updatePointsDisplay(0);
        // Update chatbot context
        if (typeof updateChatbotContext === 'function') {
            updateChatbotContext();
        }
    }
}

// Utility Functions
function formatDateTime(date) {
    const now = new Date();
    const taskDate = new Date(date);
    const diffTime = taskDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return `Today at ${taskDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
        return `Tomorrow at ${taskDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === -1) {
        return `Yesterday at ${taskDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return taskDate.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: taskDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize points display on load
document.addEventListener('DOMContentLoaded', function () {
    const points = parseInt(localStorage.getItem('points') || '0');
    updatePointsDisplay(points);
});

// ==================== CHATBOT FUNCTIONALITY ====================

// Chatbot State
const chatbotState = {
    isOpen: false,
    messageHistory: [],
    lastQuestionTime: null,
    context: {
        lastTaskCompleted: null,
        streak: 0,
        points: 0
    }
};

// Motivational messages and questions
const motivationalQuotes = [
    "Every expert was once a beginner. Keep going! 💪",
    "Success is the sum of small efforts repeated day in and day out. 🔥",
    "You're doing great! Remember, progress is progress, no matter how small. ✨",
    "The only way to do great work is to love what you do. Keep pushing! 🌟",
    "Believe you can and you're halfway there! You've got this! 🚀"
];

const studyTips = [
    "Try the Pomodoro Technique: 25 minutes of focused study, then a 5-minute break! ⏰",
    "Break large tasks into smaller, manageable chunks. It makes everything less overwhelming! 📝",
    "Review your notes within 24 hours of learning - it helps retention by up to 60%! 🧠",
    "Stay hydrated and take regular breaks. Your brain works better when you're refreshed! 💧",
    "Use active recall: test yourself instead of just re-reading. It's more effective! 🎯",
    "Create a dedicated study space free from distractions. Environment matters! 📚",
    "Teach someone else what you've learned - it's one of the best ways to master a topic! 👥"
];

const questions = [
    "How are you feeling about your studies today? 😊",
    "What's your biggest challenge right now? Let's tackle it together! 💪",
    "What achievement are you most proud of this week? Celebrate it! 🎉",
    "What would help you stay motivated today? 🌟",
    "What's one thing you want to accomplish today? Let's make it happen! 🎯",
    "How can I help you stay on track with your goals? 🤔",
    "What subject or topic are you most excited about right now? 📖"
];

function initializeChatbot() {
    // Load chat history from localStorage
    const savedHistory = localStorage.getItem('chatbotHistory');
    if (savedHistory) {
        chatbotState.messageHistory = JSON.parse(savedHistory);
        renderChatHistory();
    }

    // Send initial greeting if no history
    if (chatbotState.messageHistory.length === 0) {
        setTimeout(() => {
            sendBotMessage(getInitialGreeting());
        }, 1000);
    }

    // Update context
    updateChatbotContext();
}

function updateChatbotContext() {
    const streakData = JSON.parse(localStorage.getItem('streak') || '{"current": 0}');
    const points = parseInt(localStorage.getItem('points') || '0');
    const tasks = getTasks();
    const recentCompleted = tasks.filter(t => t.completed && t.completedAt).sort((a, b) =>
        new Date(b.completedAt) - new Date(a.completedAt)
    )[0];

    chatbotState.context.streak = streakData.current || 0;
    chatbotState.context.points = points;
    chatbotState.context.lastTaskCompleted = recentCompleted ? recentCompleted.completedAt : null;
}

function getInitialGreeting() {
    updateChatbotContext();
    const streak = chatbotState.context.streak;
    const tasks = getTasks();
    const todayTasks = tasks.filter(t => {
        const taskDate = new Date(t.deadline);
        const today = new Date();
        return taskDate.toDateString() === today.toDateString();
    });

    let greeting = "Hey there! 👋 I'm your Study Buddy! ";

    if (streak > 0) {
        greeting += `🔥 I see you have a ${streak}-day streak going! That's amazing! Keep it up! `;
    }

    if (todayTasks.length > 0) {
        greeting += `You have ${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} scheduled for today. `;
    }

    greeting += "How are you feeling about your studies today? 😊";

    return greeting;
}

function toggleChatbot() {
    chatbotState.isOpen = !chatbotState.isOpen;
    const window = document.getElementById('chatbotWindow');
    const button = document.getElementById('chatbotButton');

    if (chatbotState.isOpen) {
        window.classList.add('open');
        button.classList.add('active');
        // Hide badge when opened
        document.getElementById('chatbotBadge').style.display = 'none';
        // Focus input
        setTimeout(() => {
            document.getElementById('chatbotInput').focus();
        }, 300);
    } else {
        window.classList.remove('open');
        button.classList.remove('active');
    }
}

function handleChatbotKeyPress(event) {
    if (event.key === 'Enter') {
        sendChatbotMessage();
    }
}

function sendChatbotMessage() {
    const input = document.getElementById('chatbotInput');
    const message = input.value.trim();

    if (!message) return;

    // Add user message
    addMessage(message, 'user');
    input.value = '';

    // Generate bot response
    setTimeout(() => {
        const response = generateBotResponse(message);
        sendBotMessage(response);
    }, 500);
}

function addMessage(text, sender) {
    const messagesContainer = document.getElementById('chatbotMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chatbot-message ${sender}`;

    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(text)}</div>
        <div class="message-time">${time}</div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Save to history
    chatbotState.messageHistory.push({ text, sender, time: new Date().toISOString() });
    localStorage.setItem('chatbotHistory', JSON.stringify(chatbotState.messageHistory));
}

function sendBotMessage(text) {
    addMessage(text, 'bot');

    // Ask a question after a delay if appropriate
    if (Math.random() > 0.5) {
        setTimeout(() => {
            askRandomQuestion();
        }, 2000);
    }
}

function renderChatHistory() {
    const messagesContainer = document.getElementById('chatbotMessages');
    messagesContainer.innerHTML = '';

    chatbotState.messageHistory.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chatbot-message ${msg.sender}`;
        messageDiv.innerHTML = `
            <div class="message-content">${escapeHtml(msg.text)}</div>
            <div class="message-time">${new Date(msg.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
        `;
        messagesContainer.appendChild(messageDiv);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function generateBotResponse(userMessage) {
    const message = userMessage.toLowerCase();
    updateChatbotContext();

    // Check for greetings
    if (message.match(/hi|hello|hey|greetings/)) {
        return getInitialGreeting();
    }

    // Check for feelings/emotions
    if (message.match(/feeling|feel|good|great|bad|tired|stressed|overwhelmed|excited|motivated/)) {
        if (message.match(/good|great|excited|motivated|amazing|wonderful/)) {
            return "That's fantastic! 🎉 I'm so glad you're feeling positive! Keep that energy going. What's helping you stay motivated? 💪";
        } else if (message.match(/bad|tired|stressed|overwhelmed|difficult|hard|struggling/)) {
            return "I understand it can be tough sometimes. 😔 Remember, you've come this far! Take a deep breath. Would you like a study tip to help you get back on track? 🌟";
        }
    }

    // Check for task-related queries
    if (message.match(/task|assignment|homework|deadline|due/)) {
        const tasks = getTasks();
        const pending = tasks.filter(t => !t.completed);
        const overdue = pending.filter(t => new Date(t.deadline) < new Date());

        if (overdue.length > 0) {
            return `I notice you have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}. Don't worry - let's tackle them one at a time! 💪 Start with the most urgent one. You've got this! 🚀`;
        } else if (pending.length > 0) {
            return `You have ${pending.length} task${pending.length > 1 ? 's' : ''} pending. That's totally manageable! Focus on one task at a time. Would you like a study tip? 📚`;
        } else {
            return "Great job! It looks like you're all caught up with your tasks! 🎉 Keep up the excellent work! ✨";
        }
    }

    // Check for help requests
    if (message.match(/help|tip|advice|suggest|how|what should|what can/)) {
        return studyTips[Math.floor(Math.random() * studyTips.length)];
    }

    // Check for motivation requests
    if (message.match(/motivat|encourage|inspire|quote/)) {
        return motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
    }

    // Check for progress/streak queries
    if (message.match(/streak|progress|how am i|how am i doing|stats/)) {
        const streak = chatbotState.context.streak;
        const points = chatbotState.context.points;
        const tasks = getTasks();
        const completed = tasks.filter(t => t.completed).length;

        return `You're doing amazing! 🔥 You have a ${streak}-day streak, ${points} points, and you've completed ${completed} task${completed !== 1 ? 's' : ''}! Keep up the fantastic work! 💪`;
    }

    // Check for thanks/gratitude
    if (message.match(/thank|thanks|appreciate|grateful/)) {
        return "You're so welcome! 😊 I'm here to help you succeed. Remember, every step forward counts! Keep going! 🌟";
    }

    // Default responses
    const defaultResponses = [
        "That's interesting! Tell me more about that. 🤔",
        "I'm here to help! What would you like to know? 💭",
        "Great to hear from you! How can I help you stay motivated today? 🌟",
        "I understand! Remember, progress takes time. You're doing great! 💪",
        "That's a good point! Keep pushing forward - you've got this! 🚀"
    ];

    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}


function askRandomQuestion() {
    const question = questions[Math.floor(Math.random() * questions.length)];
    sendBotMessage(question);
    chatbotState.lastQuestionTime = new Date();
}


// ==================== CELEBRATION ANIMATION ====================

function triggerCelebration() {
    // Check if canvas already exists
    if (document.getElementById('celebrationCanvas')) return;

    // Add blur effect class
    document.body.classList.add('celebrating');

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'celebrationCanvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none'; // Allow clicking through
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const fireworks = [];

    // Text configuration
    const texts = [
        { text: "CONGRATULATIONS!", y: canvas.height / 2 - 50, size: 60, alpha: 0 },
        { text: "200 POINTS REACHED!", y: canvas.height / 2 + 30, size: 40, alpha: 0 }
    ];

    class Firework {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = canvas.height;
            this.sx = Math.random() * 4 - 2;
            this.sy = Math.random() * -4 - 10; // Higher blast
            this.size = Math.random() * 2 + 1;
            this.hue = Math.random() * 360;
            this.shouldExplode = false;
        }

        update() {
            this.x += this.sx;
            this.y += this.sy;
            this.sy += 0.15; // get gravity

            // Explode when reaching peak or slowing down
            if (this.sy >= -1 || this.y <= 100 || Math.random() > 0.98) {
                this.shouldExplode = true;
            }
        }

        draw() {
            ctx.fillStyle = `hsl(${this.hue}, 100%, 50%)`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    class Particle {
        constructor(x, y, hue) {
            this.x = x;
            this.y = y;
            // Explosion burst
            const angle = Math.random() * Math.PI * 2;
            const velocity = Math.random() * 6 + 2;
            this.sx = Math.cos(angle) * velocity;
            this.sy = Math.sin(angle) * velocity;
            this.size = Math.random() * 3 + 1;
            this.hue = hue;
            this.life = 150;
            this.decay = Math.random() * 0.015 + 0.01;
            this.gravity = 0.1;
            this.friction = 0.96;
        }

        update() {
            this.sx *= this.friction;
            this.sy *= this.friction;
            this.sy += this.gravity;
            this.x += this.sx;
            this.y += this.sy;
            this.life -= 1;
            this.size *= 0.98;
        }

        draw() {
            ctx.fillStyle = `hsla(${this.hue}, 100%, 60%, ${this.life / 100})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    let duration = 6000; // Run for 6 seconds
    const startTime = Date.now();

    function animate() {
        // Clear logic for transparent background
        // User requested "dont black thw home page", so we use clearRect
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const elapsed = Date.now() - startTime;

        // Text Animation
        if (elapsed < 1000) {
            // Fade in
            texts.forEach(t => t.alpha = Math.min(1, elapsed / 1000));
        } else if (elapsed > duration - 1000) {
            // Fade out
            texts.forEach(t => t.alpha = Math.max(0, (duration - elapsed) / 1000));
        } else {
            texts.forEach(t => t.alpha = 1);
        }

        // Draw Text
        ctx.save();
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        texts.forEach(t => {
            ctx.font = `bold ${t.size}px 'Segoe UI', sans-serif`;
            ctx.fillStyle = `rgba(255, 215, 0, ${t.alpha})`; // Gold color
            ctx.fillText(t.text, canvas.width / 2, t.y);
            // Stroke for better visibility
            ctx.strokeStyle = `rgba(255, 255, 255, ${t.alpha})`;
            ctx.lineWidth = 2;
            ctx.strokeText(t.text, canvas.width / 2, t.y);
        });
        ctx.restore();

        // Add fireworks randomly
        if (Math.random() < 0.15 && elapsed < duration - 1000) {
            fireworks.push(new Firework());
        }

        // Update and draw fireworks
        for (let i = fireworks.length - 1; i >= 0; i--) {
            fireworks[i].update();
            fireworks[i].draw();

            if (fireworks[i].shouldExplode) {
                // More particles for bigger boom
                for (let j = 0; j < 80; j++) {
                    particles.push(new Particle(fireworks[i].x, fireworks[i].y, fireworks[i].hue));
                }
                fireworks.splice(i, 1);
            }
        }

        // Update and draw particles
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].draw();

            if (particles[i].life <= 0 || particles[i].size <= 0.1) {
                particles.splice(i, 1);
            }
        }

        if (elapsed < duration || particles.length > 0) {
            requestAnimationFrame(animate);
        } else {
            // Clean up
            canvas.remove();
            document.body.classList.remove('celebrating'); // Remove blur effect
        }
    }

    animate();

    // Play sound effect if desired/possible (commented out for now to avoid sound issues)
    // const audio = new Audio('https://path-to-sound.mp3');
    // audio.play().catch(e => console.log('Audio autoplay prevented'));
}

// Add Easter Egg Trigger on Points Display
document.addEventListener('DOMContentLoaded', () => {
    const pointsDisplay = document.querySelector('.points-display');
    if (pointsDisplay) {
        pointsDisplay.style.cursor = 'pointer';
        pointsDisplay.title = 'Click to test celebration!';
        pointsDisplay.addEventListener('click', triggerCelebration);
    }
});

// Timer Logic
let timerInterval;
const circleData = { radius: 140, circumference: 2 * Math.PI * 140 };

function initTimer() {
    const circle = document.querySelector('.progress-ring__circle');
    if (circle) {
        circle.style.strokeDasharray = `${circleData.circumference} ${circleData.circumference}`;
        circle.style.strokeDashoffset = 0; // Start full
    }

    // Initial state
    appState.timer = {
        timeLeft: 25 * 60,
        totalTime: 25 * 60,
        isRunning: false,
        mode: 'Focus Time'
    };

    // Try to attach listeners if elements exist
    const startBtn = document.getElementById('startTimerBtn');
    const resetBtn = document.getElementById('resetTimerBtn');

    if (startBtn) startBtn.addEventListener('click', toggleTimer);
    if (resetBtn) resetBtn.addEventListener('click', resetTimer);

    // Initial display update
    // setTimeout to ensure DOM is ready/painted
    setTimeout(updateTimerDisplay, 100);
}

function updateTimerDisplay() {
    if (!appState.timer) return;

    const minutes = Math.floor(appState.timer.timeLeft / 60);
    const seconds = appState.timer.timeLeft % 60;

    const timeEl = document.getElementById('timeLeft');
    const modeEl = document.getElementById('timerMode');

    if (timeEl) timeEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    if (modeEl) modeEl.textContent = appState.timer.mode;

    const circle = document.querySelector('.progress-ring__circle');
    if (circle) {
        const offset = circleData.circumference - ((appState.timer.totalTime - appState.timer.timeLeft) / appState.timer.totalTime) * circleData.circumference;
        circle.style.strokeDashoffset = offset;
    }
}

function toggleTimer() {
    const btn = document.getElementById('startTimerBtn');

    if (appState.timer.isRunning) {
        // Pause
        clearInterval(timerInterval);
        appState.timer.isRunning = false;
        if (btn) {
            btn.innerHTML = '<i class="fas fa-play"></i> Start';
            btn.className = 'btn-primary';
        }
    } else {
        // Start
        appState.timer.isRunning = true;
        if (btn) {
            btn.innerHTML = '<i class="fas fa-pause"></i> Pause';
            btn.className = 'btn-secondary';
        }

        timerInterval = setInterval(() => {
            if (appState.timer.timeLeft > 0) {
                appState.timer.timeLeft--;
                updateTimerDisplay();
            } else {
                clearInterval(timerInterval);
                appState.timer.isRunning = false;
                if (btn) {
                    btn.innerHTML = '<i class="fas fa-play"></i> Start';
                    btn.className = 'btn-primary';
                }

                // Play sound or notification
                if (Notification.permission === "granted") {
                    new Notification("Timer Finished!", { body: `${appState.timer.mode} is over!` });
                } else if (Notification.permission !== "denied") {
                    Notification.requestPermission().then(permission => {
                        if (permission === "granted") {
                            new Notification("Timer Finished!", { body: `${appState.timer.mode} is over!` });
                        }
                    });
                } else {
                    // Fallback if notifications not supported/allowed
                    // alert(`${appState.timer.mode} finished!`);
                }
            }
        }, 1000);
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    appState.timer.isRunning = false;
    appState.timer.timeLeft = appState.timer.totalTime;

    const btn = document.getElementById('startTimerBtn');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-play"></i> Start';
        btn.className = 'btn-primary';
    }

    updateTimerDisplay();
}

// Global function for onclick
window.setTimer = function (minutes, mode) {
    clearInterval(timerInterval);
    appState.timer.isRunning = false;
    appState.timer.timeLeft = minutes * 60;
    appState.timer.totalTime = minutes * 60;
    appState.timer.mode = mode;

    const btn = document.getElementById('startTimerBtn');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-play"></i> Start';
        btn.className = 'btn-primary';
    }

    updateTimerDisplay();
}

