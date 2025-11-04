pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract GeneTreeAdapter is ZamaEthereumConfig {
    
    struct GeneticData {
        string familyId;                
        euint32 encryptedDna;            
        uint256 generation;              
        uint256 relationshipCode;        
        string medicalHistory;           
        address member;                 
        uint256 timestamp;              
        uint32 decryptedDna;            
        bool isDecrypted;               
    }
    
    mapping(string => GeneticData) public geneticRecords;
    string[] public familyIds;
    
    event GeneticDataAdded(string indexed familyId, address indexed member);
    event DecryptionCompleted(string indexed familyId, uint32 decryptedDna);
    
    constructor() ZamaEthereumConfig() {
    }
    
    function addGeneticData(
        string calldata familyId,
        externalEuint32 encryptedDna,
        bytes calldata inputProof,
        uint256 generation,
        uint256 relationshipCode,
        string calldata medicalHistory
    ) external {
        require(bytes(geneticRecords[familyId].familyId).length == 0, "Genetic data already exists");
        
        require(FHE.isInitialized(FHE.fromExternal(encryptedDna, inputProof)), "Invalid encrypted DNA");
        
        geneticRecords[familyId] = GeneticData({
            familyId: familyId,
            encryptedDna: FHE.fromExternal(encryptedDna, inputProof),
            generation: generation,
            relationshipCode: relationshipCode,
            medicalHistory: medicalHistory,
            member: msg.sender,
            timestamp: block.timestamp,
            decryptedDna: 0,
            isDecrypted: false
        });
        
        FHE.allowThis(geneticRecords[familyId].encryptedDna);
        FHE.makePubliclyDecryptable(geneticRecords[familyId].encryptedDna);
        
        familyIds.push(familyId);
        
        emit GeneticDataAdded(familyId, msg.sender);
    }
    
    function verifyDnaDecryption(
        string calldata familyId, 
        bytes memory abiEncodedClearDna,
        bytes memory decryptionProof
    ) external {
        require(bytes(geneticRecords[familyId].familyId).length > 0, "Genetic data does not exist");
        require(!geneticRecords[familyId].isDecrypted, "DNA already decrypted");
        
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(geneticRecords[familyId].encryptedDna);
        
        FHE.checkSignatures(cts, abiEncodedClearDna, decryptionProof);
        
        uint32 decodedDna = abi.decode(abiEncodedClearDna, (uint32));
        
        geneticRecords[familyId].decryptedDna = decodedDna;
        geneticRecords[familyId].isDecrypted = true;
        
        emit DecryptionCompleted(familyId, decodedDna);
    }
    
    function getEncryptedDna(string calldata familyId) external view returns (euint32) {
        require(bytes(geneticRecords[familyId].familyId).length > 0, "Genetic data does not exist");
        return geneticRecords[familyId].encryptedDna;
    }
    
    function getGeneticRecord(string calldata familyId) external view returns (
        string memory familyId_,
        uint256 generation,
        uint256 relationshipCode,
        string memory medicalHistory,
        address member,
        uint256 timestamp,
        bool isDecrypted,
        uint32 decryptedDna
    ) {
        require(bytes(geneticRecords[familyId].familyId).length > 0, "Genetic data does not exist");
        GeneticData storage data = geneticRecords[familyId];
        
        return (
            data.familyId,
            data.generation,
            data.relationshipCode,
            data.medicalHistory,
            data.member,
            data.timestamp,
            data.isDecrypted,
            data.decryptedDna
        );
    }
    
    function getAllFamilyIds() external view returns (string[] memory) {
        return familyIds;
    }
    
    function isAvailable() public pure returns (bool) {
        return true;
    }
}


