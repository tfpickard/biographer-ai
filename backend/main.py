#!/usr/bin/env python3
"""
Biographer AI Backend
A FastAPI application that generates biographical questions using LLMs
and stores Q&A pairs for building an exhaustive autobiography.
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
import sqlite3
import json
import asyncio
import aiohttp
from datetime import datetime
import os
import uvicorn

app = FastAPI(title="Biographer AI", version="1.0.0")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database setup
DB_PATH = "biographer.db"

def init_db():
    """Initialize the SQLite database with required tables."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS qa_pairs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            answer TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_custom BOOLEAN DEFAULT FALSE,
            category TEXT,
            metadata TEXT
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS llm_config (
            id INTEGER PRIMARY KEY,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            api_key TEXT NOT NULL
        )
    """)
    
    conn.commit()
    conn.close()

# Pydantic models
class LLMConfig(BaseModel):
    provider: str = Field(..., description="LLM provider: chatgpt, claude, or openrouter")
    model: str = Field(..., description="Specific model name")
    api_key: str = Field(..., description="API key for the provider")

class QAPair(BaseModel):
    id: Optional[int] = None
    question: str
    answer: Optional[str] = None
    timestamp: Optional[datetime] = None
    is_custom: bool = False
    category: Optional[str] = None

class QuestionRequest(BaseModel):
    custom_question: Optional[str] = None

class AnswerRequest(BaseModel):
    qa_id: int
    answer: str

# LLM Provider configurations
LLM_MODELS = {
    "chatgpt": [
        "gpt-4",
        "gpt-4-turbo",
        "gpt-3.5-turbo"
    ],
    "claude": [
        "claude-3-5-sonnet-20241022",
        "claude-3-opus-20240229",
        "claude-3-haiku-20240307"
    ],
    "openrouter": [
        "anthropic/claude-3.5-sonnet",
        "openai/gpt-4",
        "meta-llama/llama-3.1-405b-instruct"
    ]
}

# Database helper functions
def get_db_connection():
    """Get database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_llm_config():
    """Retrieve current LLM configuration."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM llm_config WHERE id = 1")
    config = cursor.fetchone()
    conn.close()
    return dict(config) if config else None

def get_all_qa_pairs():
    """Retrieve all Q&A pairs from database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM qa_pairs ORDER BY timestamp DESC")
    pairs = cursor.fetchall()
    conn.close()
    return [dict(pair) for pair in pairs]

# LLM Integration
async def call_chatgpt(prompt: str, config: dict) -> str:
    """Call ChatGPT API."""
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {config['api_key']}",
        "Content-Type": "application/json"
    }
    data = {
        "model": config["model"],
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 500,
        "temperature": 0.7
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=data) as response:
            if response.status != 200:
                raise HTTPException(status_code=500, detail="ChatGPT API call failed")
            result = await response.json()
            return result["choices"][0]["message"]["content"].strip()

async def call_claude(prompt: str, config: dict) -> str:
    """Call Claude API."""
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": config["api_key"],
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
    }
    data = {
        "model": config["model"],
        "max_tokens": 500,
        "messages": [{"role": "user", "content": prompt}]
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=data) as response:
            if response.status != 200:
                raise HTTPException(status_code=500, detail="Claude API call failed")
            result = await response.json()
            return result["content"][0]["text"].strip()

async def call_openrouter(prompt: str, config: dict) -> str:
    """Call OpenRouter API."""
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {config['api_key']}",
        "Content-Type": "application/json"
    }
    data = {
        "model": config["model"],
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 500,
        "temperature": 0.7
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=data) as response:
            if response.status != 200:
                raise HTTPException(status_code=500, detail="OpenRouter API call failed")
            result = await response.json()
            return result["choices"][0]["message"]["content"].strip()

async def generate_question_with_llm(existing_qa_pairs: List[dict]) -> str:
    """Generate a new biographical question using the configured LLM."""
    config = get_llm_config()
    if not config:
        raise HTTPException(status_code=400, detail="LLM not configured")
    
    # Create context from existing Q&A pairs
    qa_context = ""
    if existing_qa_pairs:
        qa_context = "Previous questions and answers:\n"
        for pair in existing_qa_pairs[-10:]:  # Last 10 Q&A pairs for context
            qa_context += f"Q: {pair['question']}\n"
            if pair['answer']:
                qa_context += f"A: {pair['answer']}\n\n"
    
    prompt = f"""You are an expert biographer tasked with creating an exhaustive, authoritative autobiography. 
    
{qa_context}

Based on the previous questions and answers (if any), generate ONE thoughtful, specific biographical question that would help build a comprehensive life story. 

The question should:
- Be open-ended and encourage detailed responses
- Explore different aspects of life (childhood, education, relationships, career, beliefs, experiences, etc.)
- Build naturally on previous answers when possible
- Avoid redundancy with already-asked questions
- Be personally meaningful and likely to reveal important details

Return only the question, without any additional text or formatting."""

    # Call appropriate LLM
    if config["provider"] == "chatgpt":
        return await call_chatgpt(prompt, config)
    elif config["provider"] == "claude":
        return await call_claude(prompt, config)
    elif config["provider"] == "openrouter":
        return await call_openrouter(prompt, config)
    else:
        raise HTTPException(status_code=400, detail="Unsupported LLM provider")

# API Endpoints
@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    init_db()

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"message": "Biographer AI Backend Running"}

@app.get("/models/{provider}")
async def get_models(provider: str):
    """Get available models for a provider."""
    if provider not in LLM_MODELS:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    return {"models": LLM_MODELS[provider]}

@app.post("/config/llm")
async def set_llm_config(config: LLMConfig):
    """Configure LLM provider and model."""
    if config.provider not in LLM_MODELS:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    
    if config.model not in LLM_MODELS[config.provider]:
        raise HTTPException(status_code=400, detail="Unsupported model for provider")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO llm_config (id, provider, model, api_key)
        VALUES (1, ?, ?, ?)
    """, (config.provider, config.model, config.api_key))
    conn.commit()
    conn.close()
    
    return {"message": "LLM configuration saved"}

@app.get("/config/llm")
async def get_current_llm_config():
    """Get current LLM configuration (without API key)."""
    config = get_llm_config()
    if config:
        return {
            "provider": config["provider"],
            "model": config["model"],
            "configured": True
        }
    return {"configured": False}

@app.post("/question/generate")
async def generate_question(request: QuestionRequest = None):
    """Generate a new biographical question."""
    if request and request.custom_question:
        # User provided custom question
        question = request.custom_question.strip()
    else:
        # Generate question using LLM
        existing_pairs = get_all_qa_pairs()
        question = await generate_question_with_llm(existing_pairs)
    
    # Store question in database
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO qa_pairs (question, is_custom)
        VALUES (?, ?)
    """, (question, bool(request and request.custom_question)))
    qa_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        "id": qa_id,
        "question": question,
        "is_custom": bool(request and request.custom_question)
    }

@app.post("/answer")
async def submit_answer(request: AnswerRequest):
    """Submit an answer to a question."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE qa_pairs SET answer = ? WHERE id = ?
    """, (request.answer, request.qa_id))
    
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Question not found")
    
    conn.commit()
    conn.close()
    
    return {"message": "Answer saved"}

@app.get("/qa")
async def get_qa_pairs():
    """Get all Q&A pairs."""
    pairs = get_all_qa_pairs()
    return {"qa_pairs": pairs}

@app.put("/qa/{qa_id}")
async def update_qa_pair(qa_id: int, qa_pair: QAPair):
    """Update a Q&A pair."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE qa_pairs 
        SET question = ?, answer = ?, category = ?
        WHERE id = ?
    """, (qa_pair.question, qa_pair.answer, qa_pair.category, qa_id))
    
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Q&A pair not found")
    
    conn.commit()
    conn.close()
    
    return {"message": "Q&A pair updated"}

@app.delete("/qa/{qa_id}")
async def delete_qa_pair(qa_id: int):
    """Delete a Q&A pair."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM qa_pairs WHERE id = ?", (qa_id,))
    
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Q&A pair not found")
    
    conn.commit()
    conn.close()
    
    return {"message": "Q&A pair deleted"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)