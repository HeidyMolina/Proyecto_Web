document.addEventListener('DOMContentLoaded', () => {
  const etiquetas = {
    cursos: "📚 Cursos",
    reglamento_en_paz: "🕊 Reglamento de paz",
    reglamento_sanciones: "⚖ Reglamento de sanciones",
    reglamento_servicio_civico: "🤝 Reglamento servicio cívico",
    reglamento_demeritos: "📜 Reglamento de deméritos",
    faltas: "🚫 Sobre las faltas",
    codigo_militar: "🎖 Código Militar"
  };

  const form = document.getElementById('chat-form');
  const input = document.getElementById('userInput');
  const chatBody = document.getElementById('chat-body');
  const submitButton = form.querySelector('button[type="submit"]') || form.querySelector('input[type="submit"]');

  let topic = null;
  let awaitingDecision = false; // Estado para esperar decisión de continuar/cambiar
  let availableTopics = []; // Guardar los temas disponibles
  let isTyping = false; // Estado para controlar si la IA está escribiendo
  const session_id = crypto.randomUUID(); // ID único para la sesión

  // Función para deshabilitar/habilitar el formulario
  function setFormState(disabled) {
    input.disabled = disabled;
    if (submitButton) {
      submitButton.disabled = disabled;
    }
    
    // Cambiar apariencia visual para indicar que está deshabilitado
    if (disabled) {
      input.style.opacity = '0.6';
      input.style.cursor = 'not-allowed';
      input.placeholder = 'Justito está escribiendo...';
      if (submitButton) {
        submitButton.style.opacity = '0.6';
        submitButton.style.cursor = 'not-allowed';
      }
    } else {
      input.style.opacity = '1';
      input.style.cursor = 'text';
      input.placeholder = 'Escribe tu mensaje...';
      if (submitButton) {
        submitButton.style.opacity = '1';
        submitButton.style.cursor = 'pointer';
      }
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Función para limpiar las respuestas del servidor
  function cleanResponse(response) {
    if (typeof response !== 'string') {
      return response;
    }

    let cleanText = response;

    // Debug: mostrar la respuesta original en consola
    console.log('🔍 Respuesta original:', JSON.stringify(cleanText));

    // Solo aplicar limpieza si la respuesta tiene pipes repetitivos (problema específico)
    if (cleanText.includes('|') && cleanText.split('|').length > 3) {
      // Limpiar estructura de pipes y mantener solo la información esencial
      let parts = cleanText.split('|').map(part => part.trim()).filter(part => part.length > 0);
      
      // Eliminar duplicados consecutivos
      let uniqueParts = [];
      let lastPart = '';
      for (let part of parts) {
        if (part !== lastPart && !uniqueParts.includes(part)) {
          uniqueParts.push(part);
          lastPart = part;
        }
      }
      
      // Si tenemos información estructurada, formatearla mejor
      if (uniqueParts.length > 1) {
        // Buscar la respuesta principal (probablemente la primera parte)
        let mainAnswer = uniqueParts[0];
        
        // Si hay información adicional relevante, agregarla
        let additionalInfo = uniqueParts.slice(1).filter(part => 
          !mainAnswer.toLowerCase().includes(part.toLowerCase()) && 
          part.length > 3 &&
          !part.match(/^(dos horas|faltas|presentacion)$/i)
        );
        
        if (additionalInfo.length > 0) {
          cleanText = mainAnswer + '. ' + additionalInfo.join('. ') + '.';
        } else {
          cleanText = mainAnswer;
        }
      } else {
        cleanText = uniqueParts.join(' ');
      }
    }
    
    // Eliminar frases repetidas (sin importar si tiene pipes o no)
    const sentences = cleanText.split(/([.!?]+\s*)/);
    const uniqueSentences = [];
    const seenSentences = new Set();
    
    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = sentences[i]?.trim();
      const punctuation = sentences[i + 1] || '';
      
      if (sentence && sentence.length > 0) {
        // Normalizar para comparación (sin espacios extra, minúsculas)
        const normalized = sentence.toLowerCase().replace(/\s+/g, ' ').trim();
        
        if (!seenSentences.has(normalized)) {
          seenSentences.add(normalized);
          uniqueSentences.push(sentence + punctuation);
        }
      }
    }
    
    cleanText = uniqueSentences.join(' ').trim();
    
    // Eliminar texto incompleto al final (entre paréntesis o que termine abruptamente)
    cleanText = cleanText.replace(/\s*\([^)]*$/g, ''); // Paréntesis no cerrados al final
    cleanText = cleanText.replace(/\s*[A-Z][A-Z\s,]*$/g, ''); // Texto en mayúsculas incompleto al final
    
    // Eliminar puntos dobles al final
    cleanText = cleanText.replace(/\.\s*\.$/, '.');
    
    // Asegurar que termine con punto si no tiene puntuación final
    if (cleanText && !cleanText.match(/[.!?]$/)) {
      cleanText += '.';
    }
    
    // Limpieza mínima para todos los casos (solo espacios múltiples en la misma línea)
    cleanText = cleanText.replace(/[ \t]+/g, ' ');
    
    // Eliminar espacios al inicio y final
    cleanText = cleanText.trim();

    // Debug: mostrar la respuesta limpia en consola
    console.log('✅ Respuesta limpia:', JSON.stringify(cleanText));
    
    return cleanText;
  }

  function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.classList.add('bubble', 'bot');
    indicator.textContent = 'Justito está escribiendo...';
    indicator.id = 'typing-indicator';
    chatBody.appendChild(indicator);
    chatBody.scrollTop = chatBody.scrollHeight;
    
    // Deshabilitar formulario cuando aparece el indicador
    isTyping = true;
    setFormState(true);
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
  }

  function addUserMessage(text) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userBubble = document.createElement('div');
    userBubble.classList.add('bubble', 'user');
    userBubble.innerHTML = `${escapeHtml(text)}<span class="timestamp">${time}</span><span class="check">✔✔</span>`;
    chatBody.appendChild(userBubble);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function addBotMessageTyping(text, callback, speed = 30) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const botBubble = document.createElement('div');
    botBubble.classList.add('bubble', 'bot');

    const msgSpan = document.createElement('span');
    botBubble.appendChild(msgSpan);

    const timeSpan = document.createElement('span');
    timeSpan.classList.add('timestamp');
    timeSpan.textContent = time;
    botBubble.appendChild(timeSpan);

    chatBody.appendChild(botBubble);
    chatBody.scrollTop = chatBody.scrollHeight;

    // Asegurar que el formulario esté deshabilitado durante la escritura
    isTyping = true;
    setFormState(true);

    let index = 0;
    // Aplicar limpieza antes de mostrar el texto
    const cleanText = cleanResponse(text);
    const textSafe = escapeHtml(cleanText);

    function typeChar() {
      if (index < textSafe.length) {
        msgSpan.innerHTML += textSafe.charAt(index) === '\n' ? '<br>' : textSafe.charAt(index);
        index++;
        chatBody.scrollTop = chatBody.scrollHeight;
        setTimeout(typeChar, speed);
      } else {
        // Cuando termina de escribir, habilitar el formulario
        isTyping = false;
        setFormState(false);
        
        if (callback) {
          callback();
        }
      }
    }
    typeChar();
  }

  function mostrarBotones(options) {
    const optionsDiv = document.createElement('div');
    const optionsWrapper = document.createElement('div');
    optionsDiv.appendChild(optionsWrapper);

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = etiquetas[opt] || opt;

      btn.style.display = 'block';
      btn.style.width = '100%';
      btn.style.margin = '5px 0';
      btn.style.textAlign = 'left';
      btn.style.padding = '8px';
      btn.style.border = '1px solid #ccc';
      btn.style.borderRadius = '5px';
      btn.style.backgroundColor = '#f9f9f9';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'background-color 0.2s ease';

      btn.addEventListener('mouseover', () => {
        if (!btn.disabled) btn.style.backgroundColor = '#e6e6e6';
      });
      btn.addEventListener('mouseout', () => {
        if (!btn.disabled) btn.style.backgroundColor = '#f9f9f9';
      });

      btn.addEventListener('click', () => {
        Array.from(optionsWrapper.children).forEach(b => b.disabled = true);
        btn.style.backgroundColor = '#ddd';
        topic = opt;

        showTypingIndicator();
        setTimeout(() => {
          removeTypingIndicator();
          addBotMessageTyping(`Excelente elección soldado. Ahora puedes realizar preguntas al respecto.`, null, 15);

          setTimeout(async () => {
  try {
    const res = await fetch(`${window.API_CONFIG.BASE_URL}/api/info?topic=${opt}`);
    const data = await res.json();
    if (data.examples && data.examples.length > 0) {
      const ejemplos = data.examples.slice(0, 3);
      const ejemplosTexto = ejemplos.map(ej => `• ${ej.trim()}`).join('\n');
      addBotMessageTyping(
        `Algunos ejemplos de preguntas que puedes hacer:\n\n${ejemplosTexto}\n\n¡Adelante, haz tu pregunta!`,
        null,
        15
      );
    } else {
      addBotMessageTyping('Puedes preguntarme cualquier cosa sobre este tema. ¡Adelante!', null, 15);
    }
  } catch (error) {
    console.error('Error obteniendo ejemplos:', error);
    addBotMessageTyping('Puedes preguntarme cualquier cosa sobre este tema. ¡Adelante!', null, 15);
  }
}, 1000);

        }, 500);

        setTimeout(() => optionsDiv.remove(), 150);
      });

      optionsWrapper.appendChild(btn);
    });

    const botBubble = document.createElement('div');
    botBubble.classList.add('bubble', 'bot');
    const title = document.createElement('div');
    title.innerHTML = escapeHtml('Selecciona un tema:');
    botBubble.appendChild(title);
    botBubble.appendChild(optionsDiv);
    chatBody.appendChild(botBubble);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  async function getResponseFromBot(topic, message) {
    try {
  console.log('🤖 Enviando pregunta:', { topic, message });
  const res = await fetch(`${window.API_CONFIG.BASE_URL}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, question: message, session_id }),
  });


      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const text = await res.text();
      
      try {
        const data = JSON.parse(text);
        let response = '';
        
        // Manejar diferentes formatos de respuesta del servidor
        if (data.answer) {
          response = data.answer;
        } else if (data.respuesta) {
          response = Array.isArray(data.respuesta) ? data.respuesta.join('\n\n') : data.respuesta;
        } else {
          response = text;
        }
        
        // Aplicar limpieza a la respuesta
        return cleanResponse(response);
        
      } catch {
        return cleanResponse(text) || 'Respuesta no válida del servidor.';
      }
    } catch (error) {
      console.error('❌ Error en getResponseFromBot:', error);
      return `Error comunicándose con el servidor: ${error.message}`;
    }
  }

  async function handleDecision(text) {
    const decision = text.toLowerCase();
    
    if (decision.includes('cambiar') || decision.includes('otro')) {
      addUserMessage(text);
      
      try {
  // Hacer el reset del servicio
  await fetch(`${window.API_CONFIG.BASE_URL}/api/reset?session_id=${session_id}&topic=${topic}`, {
    method: "POST"
  });

        
        // Resetear el estado local
        topic = null;
        awaitingDecision = false;
        
        // Mostrar mensaje de reset y luego los botones
        addBotMessageTyping("✅ He reiniciado el tema. ¿Sobre qué deseas hablar ahora?", () => {
          // Mostrar los botones después de que termine de escribir el mensaje
          if (availableTopics.length > 0) {
            mostrarBotones(availableTopics);
          }
        });
        
      } catch (error) {
        console.error('Error al resetear:', error);
        addBotMessageTyping("❌ Hubo un error al cambiar de tema. Inténtalo de nuevo.");
        awaitingDecision = false;
      }
      
    } else if (decision.includes('seguir') || decision.includes('continuar')) {
      addUserMessage(text);
      addBotMessageTyping("👍 Perfecto, continuemos con el mismo tema. ¿Cuál es tu siguiente pregunta?");
      awaitingDecision = false;
      
    } else {
      addUserMessage(text);
      addBotMessageTyping("No entendí tu decisión 😅. Escribe 'seguir' para continuar con el tema actual o 'cambiar' para seleccionar un tema nuevo.");
      // No cambiar awaitingDecision, seguir esperando una respuesta válida
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    
    // Si está escribiendo, no procesar el envío
    if (isTyping) {
      return false;
    }
    
    const message = input.value.trim();
    if (!message) return;
    input.value = "";

    // Si no hay tema seleccionado y no está esperando decisión
    if (!topic && !awaitingDecision) {
      addBotMessageTyping("Por favor selecciona primero un tema antes de hacer preguntas.");
      return;
    }

    // Si está esperando decisión sobre continuar o cambiar tema
    if (awaitingDecision) {
      await handleDecision(message);
      return;
    }

    // Proceso normal de pregunta y respuesta
    addUserMessage(message);
    showTypingIndicator();
    const response = await getResponseFromBot(topic, message);
    removeTypingIndicator();
    
    addBotMessageTyping(response, () => {
      // Después de mostrar la respuesta, preguntar si quiere continuar
      awaitingDecision = true;
      addBotMessageTyping("¿Deseas seguir hablando de este tema o cambiar a uno nuevo? (Responde 'seguir' o 'cambiar')");
    });
  }

  // Prevenir envío con Enter si está escribiendo
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (isTyping) {
        e.preventDefault();
        return false;
      }
    }
  });

  form.addEventListener('submit', handleSubmit);

  // Carga inicial de opciones
(async () => {
  showTypingIndicator();
  try {
    const res = await fetch(`${window.API_CONFIG.BASE_URL}/api`);
    const data = await res.json();
    removeTypingIndicator();

      
      if (data.options && data.options.length > 0) {
        availableTopics = data.options; // Guardar los temas disponibles
      }
      
      if (data.message) {
        addBotMessageTyping(data.message, () => {
          if (availableTopics.length > 0) {
            mostrarBotones(availableTopics);
          }
        });
      }
    } catch (error) {
      removeTypingIndicator();
      addBotMessageTyping(`⚠ Error al conectar con el servidor: ${error.message}`);
    }
  })();
});