function transcriptTagToEng(russianTag) {
    return russianTag === 'завтрак' ? 'breakfast' : russianTag === 'обед' ? 'lunch' : 'dinner';
}

function transcriptTagToRu(engTag) {
    return engTag === 'breakfast' ? 'завтрак' : engTag === 'lunch' ? 'обед' : 'ужин';
}

export { transcriptTagToEng, transcriptTagToRu };