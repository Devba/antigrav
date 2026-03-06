export const getCurrentTimeDef = {
    type: 'function',
    function: {
        name: 'get_current_time',
        description: "Returns the current local time to the agent. Very useful when requested about today's date or time.",
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
};

export const getCurrentTime = () => {
    const now = new Date();
    return JSON.stringify({
        iso: now.toISOString(),
        localString: now.toLocaleString(),
        dayOfWeek: now.toLocaleDateString(undefined, { weekday: 'long' }),
        timezoneOffset: now.getTimezoneOffset()
    });
};
