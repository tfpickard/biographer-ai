import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = 'http://localhost:8000';

// Configuration Panel Component
const ConfigPanel = ({ config, onConfigUpdate }) => {
  const [provider, setProvider] = useState(config?.provider || 'claude');
  const [model, setModel] = useState(config?.model || '');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);

  const providerOptions = [
    { value: 'claude', label: 'Claude (Anthropic)' },
    { value: 'chatgpt', label: 'ChatGPT (OpenAI)' },
    { value: 'openrouter', label: 'OpenRouter' }
  ];

  useEffect(() => {
    if (provider) {
      fetchModels(provider);
    }
  }, [provider]);

  const fetchModels = async (selectedProvider) => {
    try {
      console.log('Fetching models for provider:', selectedProvider);
      const response = await fetch(`${API_BASE_URL}/models/${selectedProvider}`);
      const data = await response.json();
      console.log('Received models:', data.models);
      setModels(data.models);
      if (data.models.length > 0 && !model) {
        setModel(data.models[0]);
        console.log('Set default model to:', data.models[0]);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
    }
  };

  const handleSave = async () => {
    if (!provider || !model || !apiKey) {
      alert('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        provider,
        model,
        api_key: apiKey
      };
      
      console.log('Sending config:', payload);
      
      const response = await fetch(`${API_BASE_URL}/config/llm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        onConfigUpdate({ provider, model, configured: true });
        setApiKey(''); // Clear API key from display
        alert('Configuration saved successfully!');
      } else {
        const errorData = await response.text();
        console.error('Server error:', errorData);
        alert(`Failed to save configuration: ${errorData}`);
      }
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Error saving configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="config-panel">
      <h3>LLM Configuration</h3>
      <div className="form-group">
        <label>Provider:</label>
        <select 
          value={provider} 
          onChange={(e) => setProvider(e.target.value)}
          className="select-input"
        >
          {providerOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Model:</label>
        <select 
          value={model} 
          onChange={(e) => setModel(e.target.value)}
          className="select-input"
        >
          {models.map(modelName => (
            <option key={modelName} value={modelName}>
              {modelName}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>API Key:</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your API key"
          className="text-input"
        />
      </div>

      <button 
        onClick={handleSave} 
        disabled={loading}
        className="primary-button"
      >
        {loading ? 'Saving...' : 'Save Configuration'}
      </button>
    </div>
  );
};

// Question Panel Component
const QuestionPanel = ({ currentQuestion, onAnswerSubmit, onNewQuestion, config }) => {
  const [answer, setAnswer] = useState('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAnswerSubmit = async () => {
    if (!answer.trim()) {
      alert('Please provide an answer');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          qa_id: currentQuestion.id,
          answer: answer.trim()
        }),
      });

      if (response.ok) {
        onAnswerSubmit();
        setAnswer('');
        alert('Answer saved! Generate a new question to continue.');
      } else {
        alert('Failed to save answer');
      }
    } catch (error) {
      console.error('Error saving answer:', error);
      alert('Error saving answer');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuestion = async (isCustom = false) => {
    setLoading(true);
    try {
      const requestBody = isCustom && customQuestion.trim() 
        ? { custom_question: customQuestion.trim() }
        : {};

      const response = await fetch(`${API_BASE_URL}/question/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        onNewQuestion(data);
        setCustomQuestion('');
        setShowCustomInput(false);
      } else {
        alert('Failed to generate question');
      }
    } catch (error) {
      console.error('Error generating question:', error);
      alert('Error generating question');
    } finally {
      setLoading(false);
    }
  };

  if (!config?.configured) {
    return (
      <div className="question-panel">
        <p className="info-message">Please configure your LLM settings first.</p>
      </div>
    );
  }

  return (
    <div className="question-panel">
      {currentQuestion ? (
        <div>
          <h3>Current Question:</h3>
          <div className="question-box">
            {currentQuestion.question}
          </div>

          <div className="answer-section">
            <label>Your Answer:</label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Share your thoughts and experiences..."
              className="answer-textarea"
              rows="6"
            />
            <button 
              onClick={handleAnswerSubmit}
              disabled={loading || !answer.trim()}
              className="primary-button"
            >
              {loading ? 'Saving...' : 'Save Answer'}
            </button>
          </div>

          <div className="question-actions">
            <button 
              onClick={() => handleGenerateQuestion()}
              disabled={loading}
              className="secondary-button"
            >
              Generate New Question
            </button>
          </div>
        </div>
      ) : (
        <div className="no-question">
          <h3>Ready to Begin Your Biography</h3>
          <p>Click below to generate your first question.</p>
          
          <div className="question-generation">
            <button 
              onClick={() => handleGenerateQuestion()}
              disabled={loading}
              className="primary-button large"
            >
              {loading ? 'Generating...' : 'Generate First Question'}
            </button>

            <div className="custom-question-section">
              <button 
                onClick={() => setShowCustomInput(!showCustomInput)}
                className="link-button"
              >
                Or write your own question
              </button>

              {showCustomInput && (
                <div className="custom-input">
                  <textarea
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    placeholder="Enter your custom biographical question..."
                    className="custom-question-input"
                    rows="3"
                  />
                  <button 
                    onClick={() => handleGenerateQuestion(true)}
                    disabled={loading || !customQuestion.trim()}
                    className="primary-button"
                  >
                    Use This Question
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Q&A History Component
const QAHistory = ({ qaHistory, onUpdate, onDelete }) => {
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({ question: '', answer: '' });

  const startEdit = (qa) => {
    setEditingId(qa.id);
    setEditData({ question: qa.question, answer: qa.answer || '' });
  };

  const handleSave = async (qa) => {
    try {
      const response = await fetch(`${API_BASE_URL}/qa/${qa.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: editData.question,
          answer: editData.answer
        }),
      });

      if (response.ok) {
        onUpdate();
        setEditingId(null);
        setEditData({ question: '', answer: '' });
      } else {
        alert('Failed to update Q&A');
      }
    } catch (error) {
      console.error('Error updating Q&A:', error);
      alert('Error updating Q&A');
    }
  };

  const handleDelete = async (qa) => {
    if (window.confirm('Are you sure you want to delete this Q&A pair?')) {
      try {
        const response = await fetch(`${API_BASE_URL}/qa/${qa.id}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          onDelete();
        } else {
          alert('Failed to delete Q&A');
        }
      } catch (error) {
        console.error('Error deleting Q&A:', error);
        alert('Error deleting Q&A');
      }
    }
  };

  return (
    <div className="qa-history">
      <h3>Your Biography So Far ({qaHistory.length} questions)</h3>
      
      {qaHistory.length === 0 ? (
        <p className="no-history">No questions answered yet. Start by generating your first question!</p>
      ) : (
        <div className="qa-list">
          {qaHistory.map((qa) => (
            <div key={qa.id} className="qa-item">
              {editingId === qa.id ? (
                <div className="edit-form">
                  <div className="form-group">
                    <label>Question:</label>
                    <textarea
                      value={editData.question}
                      onChange={(e) => setEditData({ ...editData, question: e.target.value })}
                      className="edit-textarea"
                      rows="2"
                    />
                  </div>
                  <div className="form-group">
                    <label>Answer:</label>
                    <textarea
                      value={editData.answer}
                      onChange={(e) => setEditData({ ...editData, answer: e.target.value })}
                      className="edit-textarea"
                      rows="4"
                    />
                  </div>
                  <div className="edit-actions">
                    <button onClick={() => handleSave(qa)} className="primary-button small">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="secondary-button small">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="qa-header">
                    <span className="qa-date">
                      {new Date(qa.timestamp).toLocaleDateString()}
                    </span>
                    {qa.is_custom && <span className="custom-badge">Custom</span>}
                  </div>
                  
                  <div className="qa-question">
                    <strong>Q:</strong> {qa.question}
                  </div>
                  
                  <div className="qa-answer">
                    <strong>A:</strong> {qa.answer || <em>Not answered yet</em>}
                  </div>

                  <div className="qa-actions">
                    <button onClick={() => startEdit(qa)} className="link-button">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(qa)} className="link-button delete">
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Main App Component
const App = () => {
  const [config, setConfig] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [qaHistory, setQaHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('question');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      // Load LLM config
      const configResponse = await fetch(`${API_BASE_URL}/config/llm`);
      const configData = await configResponse.json();
      setConfig(configData);

      // Load Q&A history
      await loadQAHistory();

      // Load current unanswered question
      await loadCurrentQuestion();
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadQAHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/qa`);
      const data = await response.json();
      setQaHistory(data.qa_pairs);
    } catch (error) {
      console.error('Error loading Q&A history:', error);
    }
  };

  const loadCurrentQuestion = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/qa`);
      const data = await response.json();
      
      // Find the most recent unanswered question
      const unanswered = data.qa_pairs.find(qa => !qa.answer);
      setCurrentQuestion(unanswered || null);
    } catch (error) {
      console.error('Error loading current question:', error);
    }
  };

  const handleConfigUpdate = (newConfig) => {
    setConfig(newConfig);
  };

  const handleNewQuestion = (questionData) => {
    setCurrentQuestion(questionData);
    loadQAHistory(); // Refresh history
  };

  const handleAnswerSubmit = () => {
    setCurrentQuestion(null);
    loadQAHistory(); // Refresh history
  };

  const handleHistoryUpdate = () => {
    loadQAHistory();
    loadCurrentQuestion();
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>📖 Biographer AI</h1>
        <p>Building your complete life story, one question at a time</p>
      </header>

      <nav className="app-nav">
        <button 
          className={`nav-tab ${activeTab === 'question' ? 'active' : ''}`}
          onClick={() => setActiveTab('question')}
        >
          Current Question
        </button>
        <button 
          className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Biography History
        </button>
        <button 
          className={`nav-tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          Configuration
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'question' && (
          <QuestionPanel
            currentQuestion={currentQuestion}
            onAnswerSubmit={handleAnswerSubmit}
            onNewQuestion={handleNewQuestion}
            config={config}
          />
        )}

        {activeTab === 'history' && (
          <QAHistory
            qaHistory={qaHistory}
            onUpdate={handleHistoryUpdate}
            onDelete={handleHistoryUpdate}
          />
        )}

        {activeTab === 'config' && (
          <ConfigPanel
            config={config}
            onConfigUpdate={handleConfigUpdate}
          />
        )}
      </main>
    </div>
  );
};

export default App;