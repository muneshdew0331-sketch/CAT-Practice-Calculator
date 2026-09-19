class Calculator {
  constructor() {
    this.currentValue = '0';
    this.previousValue = null;
    this.operator = null;
    this.waitingForOperand = false;
    this.memory = 0;
    this.expression = '';

    this.expressionDisplay = document.getElementById('expressionDisplay');
    this.resultDisplay = document.getElementById('resultDisplay');
    this.memoryIndicator = document.getElementById('memoryIndicator');
    this.collapseBtn = document.getElementById('collapseBtn');
    this.closeBtn = document.getElementById('closeBtn');
    this.calculatorWindow = document.getElementById('calculatorWindow');

    this.initEventListeners();
    this.updateDisplay();
    this.updateMemoryIndicator();
  }

  initEventListeners() {
    document.querySelectorAll('.btn[data-value]').forEach(btn => {
      btn.addEventListener('click', () => this.inputNumber(btn.dataset.value));
    });

    document.querySelectorAll('.btn[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this.handleAction(btn.dataset.action));
    });

    this.collapseBtn.addEventListener('click', () => {
      window.electronAPI.collapseCalculator();
    });

    this.closeBtn.addEventListener('click', () => {
      window.electronAPI.closeCalculator();
    });

    window.electronAPI.onCollapse(() => {
      this.calculatorWindow.classList.add('collapsed');
    });
    this.calculatorWindow.addEventListener('click', () => {
      if (this.calculatorWindow.classList.contains('collapsed') && !this.dragMoved) {
        window.electronAPI.restoreCalculator();
      }
    });
    
    window.electronAPI.onRestore(() => {
      this.calculatorWindow.classList.remove('collapsed');
    });

    // Collapsed-logo dragging via pointer capture: dragging with the mouse
    // (more than the 5px threshold) anywhere on the collapsed window moves
    // it. Movement is measured in screen space because the window itself
    // moves under the cursor. A plain click (under the threshold) restores
    // the calculator from pointerup; a real drag never restores.
    this.dragPointerId = null;
    this.dragStartScreenX = 0;
    this.dragStartScreenY = 0;
    this.dragGrabClientX = 0;
    this.dragGrabClientY = 0;
    this.dragMoved = false;

    this.calculatorWindow.addEventListener('pointerdown', (e) => {
      if (!this.calculatorWindow.classList.contains('collapsed') || e.button !== 0) return;
      e.preventDefault();
      this.dragPointerId = e.pointerId;
      this.dragStartScreenX = e.screenX;
      this.dragStartScreenY = e.screenY;
      this.dragGrabClientX = e.clientX;
      this.dragGrabClientY = e.clientY;
      this.dragMoved = false;
      this.calculatorWindow.setPointerCapture(e.pointerId);
    });

    this.calculatorWindow.addEventListener('pointermove', (e) => {
      if (this.dragPointerId === null || e.pointerId !== this.dragPointerId) return;
      if (!this.calculatorWindow.classList.contains('collapsed')) return;
      const dx = e.screenX - this.dragStartScreenX;
      const dy = e.screenY - this.dragStartScreenY;
      const cx = e.clientX - this.dragGrabClientX;
      const cy = e.clientY - this.dragGrabClientY;
      if (!this.dragMoved && (dx * dx + dy * dy >= 25 || cx * cx + cy * cy >= 25)) {
        this.dragMoved = true;
      }
      if (this.dragMoved) {
        e.preventDefault();
        window.electronAPI.moveWindow(
          window.screenX + (e.clientX - this.dragGrabClientX),
          window.screenY + (e.clientY - this.dragGrabClientY)
        );
      }
    });

    this.calculatorWindow.addEventListener('pointerup', (e) => {
      if (e.pointerId !== this.dragPointerId) return;
      this.dragPointerId = null;
      if (this.dragMoved) return;
      if (this.calculatorWindow.classList.contains('collapsed')) {
        window.electronAPI.restoreCalculator();
      }
    });

    this.calculatorWindow.addEventListener('pointercancel', (e) => {
      if (e.pointerId === this.dragPointerId) {
        this.dragPointerId = null;
      }
    });

    document.addEventListener('keydown', (e) => this.handleKeyboard(e));

    document.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('btn')) {
        e.target.focus();
      }
    });
  }

  handleAction(action) {
    switch (action) {
      case 'clear':
        this.clear();
        break;
      case 'backspace':
        this.backspace();
        break;
      case 'sign':
        this.toggleSign();
        break;
      case 'sqrt':
        this.sqrt();
        break;
      case 'percent':
        this.percent();
        break;
      case 'reciprocal':
        this.reciprocal();
        break;
      case 'add':
      case 'subtract':
      case 'multiply':
      case 'divide':
        this.setOperator(action);
        break;
      case 'equals':
        this.calculate();
        break;
      case 'mc':
        this.memoryClear();
        break;
      case 'mr':
        this.memoryRecall();
        break;
      case 'ms':
        this.memoryStore();
        break;
      case 'mplus':
        this.memoryAdd();
        break;
      case 'mminus':
        this.memorySubtract();
        break;
    }
    this.updateDisplay();
    this.updateMemoryIndicator();
    this.saveState();
  }

  inputNumber(num) {
    if (this.waitingForOperand) {
      this.currentValue = num;
      this.waitingForOperand = false;
    } else {
      if (this.currentValue === '0' && num !== '.') {
        this.currentValue = num;
      } else if (num === '.' && this.currentValue.includes('.')) {
        return;
      } else {
        this.currentValue += num;
      }
    }
    this.updateDisplay();
  }

  setOperator(nextOperator) {
    const inputValue = parseFloat(this.currentValue);

    if (this.operator && this.waitingForOperand) {
      this.operator = nextOperator;
      this.updateExpression(nextOperator);
      return;
    }

    if (this.previousValue === null) {
      this.previousValue = inputValue;
    } else if (this.operator) {
      const result = this.performCalculation(this.previousValue, inputValue, this.operator);
      this.currentValue = this.formatResult(result);
      this.previousValue = result;
    }

    this.waitingForOperand = true;
    this.operator = nextOperator;
    this.updateExpression(nextOperator);
  }

  calculate() {
    if (this.operator === null || this.waitingForOperand) return;

    const inputValue = parseFloat(this.currentValue);
    const result = this.performCalculation(this.previousValue, inputValue, this.operator);

    this.expression = '';
    this.currentValue = this.formatResult(result);
    this.previousValue = null;
    this.operator = null;
    this.waitingForOperand = true;
  }

  performCalculation(a, b, op) {
    switch (op) {
      case 'add':
        return a + b;
      case 'subtract':
        return a - b;
      case 'multiply':
        return a * b;
      case 'divide':
        if (b === 0) {
          this.showError('Cannot divide by zero');
          return a;
        }
        return a / b;
      default:
        return b;
    }
  }

  formatResult(value) {
    if (!isFinite(value)) {
      return 'Error';
    }
    const str = value.toString();
    if (str.includes('e')) {
      return value.toPrecision(12).replace(/\.?0+$/, '');
    }
    const [intPart, decPart] = str.split('.');
    if (decPart && decPart.length > 10) {
      return value.toFixed(10).replace(/\.?0+$/, '');
    }
    return str.length > 12 ? value.toExponential(6) : str;
  }

  clear() {
    this.currentValue = '0';
    this.previousValue = null;
    this.operator = null;
    this.waitingForOperand = false;
    this.expression = '';
  }

  backspace() {
    if (this.waitingForOperand || this.currentValue === 'Error') return;
    if (this.currentValue.length === 1 || (this.currentValue.length === 2 && this.currentValue.startsWith('-'))) {
      this.currentValue = '0';
    } else {
      this.currentValue = this.currentValue.slice(0, -1);
    }
  }

  toggleSign() {
    if (this.currentValue === '0' || this.currentValue === 'Error') return;
    if (this.currentValue.startsWith('-')) {
      this.currentValue = this.currentValue.slice(1);
    } else {
      this.currentValue = '-' + this.currentValue;
    }
  }

  sqrt() {
    const value = parseFloat(this.currentValue);
    if (value < 0) {
      this.showError('Invalid input');
      return;
    }
    this.currentValue = this.formatResult(Math.sqrt(value));
    this.waitingForOperand = true;
  }

  percent() {
    const value = parseFloat(this.currentValue);
    this.currentValue = this.formatResult(value / 100);
    this.waitingForOperand = true;
  }

  reciprocal() {
    const value = parseFloat(this.currentValue);
    if (value === 0) {
      this.showError('Cannot divide by zero');
      return;
    }
    this.currentValue = this.formatResult(1 / value);
    this.waitingForOperand = true;
  }

  memoryClear() {
    this.memory = 0;
  }

  memoryRecall() {
    this.currentValue = this.formatResult(this.memory);
    this.waitingForOperand = true;
  }

  memoryStore() {
    this.memory = parseFloat(this.currentValue);
  }

  memoryAdd() {
    this.memory += parseFloat(this.currentValue);
  }

  memorySubtract() {
    this.memory -= parseFloat(this.currentValue);
  }

  updateExpression(op) {
    const opSymbol = {
      'add': '+',
      'subtract': '−',
      'multiply': '×',
      'divide': '÷'
    }[op] || op;
    this.expression = `${this.formatResult(this.previousValue)} ${opSymbol}`;
  }

  updateDisplay() {
    this.expressionDisplay.textContent = this.expression;
    this.resultDisplay.textContent = this.currentValue;
  }

  updateMemoryIndicator() {
    this.memoryIndicator.textContent = this.memory !== 0 ? 'M' : '';
    document.querySelectorAll('.memory-btn').forEach(btn => {
      btn.classList.toggle('active', this.memory !== 0);
    });
  }

  showError(message) {
    this.currentValue = 'Error';
    this.expressionDisplay.textContent = message;
    this.waitingForOperand = true;
    setTimeout(() => {
      if (this.currentValue === 'Error') {
        this.clear();
        this.updateDisplay();
      }
    }, 2000);
  }

  handleKeyboard(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key;
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl) return;

    switch (key) {
      case '0': case '1': case '2': case '3': case '4':
      case '5': case '6': case '7': case '8': case '9':
        this.inputNumber(key);
        break;
      case '.':
        this.inputNumber('.');
        break;
      case '+':
        this.setOperator('add');
        break;
      case '-':
        this.setOperator('subtract');
        break;
      case '*':
        this.setOperator('multiply');
        break;
      case '/':
        e.preventDefault();
        this.setOperator('divide');
        break;
      case '=':
      case 'Enter':
        e.preventDefault();
        this.calculate();
        break;
      case 'Escape':
        this.clear();
        break;
      case 'Backspace':
        this.backspace();
        break;
      case '%':
        this.percent();
        break;
    }
    this.updateDisplay();
    this.updateMemoryIndicator();
  }

  saveState() {
    window.__calculatorState = {
      currentValue: this.currentValue,
      previousValue: this.previousValue,
      operator: this.operator,
      waitingForOperand: this.waitingForOperand,
      memory: this.memory,
      expression: this.expression
    };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Restore state from previous session if exists
  if (window.__calculatorState) {
    const calc = new Calculator();
    // State was already applied in constructor via window.__calculatorState
    // Just ensure display matches
    calc.updateDisplay();
    calc.updateMemoryIndicator();
  } else {
    new Calculator();
  }
});